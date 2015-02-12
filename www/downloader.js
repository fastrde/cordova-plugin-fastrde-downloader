/**
 * EVENTS:
 * DOWNLOADER_initialized
 * DOWNLOADER_gotFileSystem
 * DOWNLOADER_gotFolder
 * DOWNLOADER_error
 * DOWNLOADER_noWifiConnection
 * DOWNLOADER_downloadSuccess
 * DOWNLOADER_downloadError
 * DOWNLOADER_downloadProgress
 * DOWNLOADER_unzipSuccess
 * DOWNLOADER_unzipError
 * DOWNLOADER_unzipProgress
 * DOWNLOADER_fileRemoved
 * DOWNLOADER_fileRemoveError
 * DOWNLOADER_getFileError
 *
 *
 * FileObject:{
 *   url: sourceURL for download
 *   name: local filename
 *   md5: md5sum of file to compare with, or null for no compare
 * }
 */
function createEvent(name, data){
  data = data || [];
  var event = document.createEvent("Event");
  event.initEvent(name);
  event.name = name;
  event.data = data;
  var log = name;
  if (data[0]) log += " : " + data[0];
  console.log("FIRE "+ log);
  return event;
};

var Downloader = {
  /** @type {org.apache.cordova.file.FileEntry} */
  localFolder : null,
  /** @type {org.apache.cordova.file.FileSystem} */
  fileSystem: null,
  /** @type {Array.<FileObjects>} */
  downloadQueue : [],
  /** @type {Array.<FileObjects>} */
  fileObjects:[],
  /** @type {boolean} */
  wifiOnly: false,
  /** @type {boolean} */
  autoUnzip: false,
  /** @type {boolean} */
  autoDelete: true,
  /** @type {boolean} */
  loading: false,
  /** @type {boolean} */
  initialized: false,

  /**
   * prepare Downloader
   * @param {Object.<String>} options
   */
  initialize: function(options){
    Downloader.setFolder(options.folder);
    Downloader.setAutoUnzip(options.unzip || false);
    document.addEventListener("DOWNLOADER_gotFileSystem",   Downloader.onGotFileSystem, false);
    document.addEventListener("DOWNLOADER_gotFolder",       Downloader.onGotFolder, false);
    document.addEventListener("DOWNLOADER_downloadSuccess", Downloader.onDownloadSuccess, false);
    document.addEventListener("DOWNLOADER_unzipSuccess",    Downloader.onUnzipSuccess, false);
    Downloader.getFilesystem();
  },

  /**
   * Adds a File to the downloadQueue and triggers the download when no file is in progress
   * @param {String} url
   * @param {?String} md5
   */
  load: function (url, md5){
    md5 = md5 || null;
    if (!Downloader.isInitialized()){
      document.addEventListener("DOWNLOADER_initialized", function onInitialized(event){
        event.target.removeEventListener("DOWNLOADER_initialized", onInitialized, false);
        Downloader.load(url, md5);
      }, false);
      return;
    }
    var fileObject = {
      url: url,
      name: url.replace(/^.*\//, ""),
      md5: md5
    };
    Downloader.downloadQueue.push(fileObject);
    if (!Downloader.isLoading()){
      Downloader.loadNextInQueue();
    }
  },

  /**
   * loads the next file in the downloadQueue
   * @returns {boolean}
   */
  loadNextInQueue: function(){
    if (Downloader.downloadQueue.length > 0){
      var fileObject = Downloader.downloadQueue.shift();
      Downloader.transferFile(fileObject);
      return true;
    }
    return false;
  },

  /**
   * @param {FileObject} fileObject
   */
  transferFile : function(fileObject) {
    var filePath = Downloader.localFolder.toURL() + "/" + fileObject.name;
    var transfer = new FileTransfer();
    transfer.onprogress = function(progressEvent) {
      if (progressEvent.lengthComputable) {
        var percentage = Math.floor(progressEvent.loaded / progressEvent.total * 100);
        document.dispatchEvent(createEvent("DOWNLOADER_downloadProgress", [percentage, fileObject.name]));
      }
    };
    transfer.download(fileObject.url, filePath, function(entry) {
      document.dispatchEvent(createEvent("DOWNLOADER_downloadSuccess", [entry]));
    }, function(error) {
      document.dispatchEvent(createEvent("DOWNLOADER_downloadError", [error]));
    });
  },

  /**
   * unzips the file
   * @param {String} fileName
   */
  //TODO: full fileEntry as param? not only fileName
  unzip : function(fileName) {
    var folderUrl = Downloader.localFolder.toURL();
    zip.unzip(folderUrl + "/" + fileName, folderUrl, function(code) {
      if (code == 0){
        document.dispatchEvent(createEvent("DOWNLOADER_unzipSuccess", [fileName]));
      }else{
        document.dispatchEvent(createEvent("DOWNLOADER_unzipError", [fileName]));
      }
    }, function(progressEvent) {
      var percentage = Math.floor(progressEvent.loaded / progressEvent.total * 100);
      document.dispatchEvent(createEvent("DOWNLOADER_unzipProgress", [percentage, fileName]));
    });
  },
  
  /**
   * removes file with name fileName from the download-directory
   * @param {String} fileName
   */
  removeFile: function(fileName){
    var folder  = Downloader.localFolder;
    folder.getFile(fileName, {
        create : false,
        exclusive : false
      }, function onGotFileToDelete(entry){
        entry.remove(function onRemoved(){
          document.dispatchEvent(createEvent("DOWNLOADER_fileRemoved", [entry]));
        }, function onRemoveError(){
          document.dispatchEvent(createEvent("DOWNLOADER_fileRemoveError", [entry]));
        });
      }, function onGetFileError(error) {
        document.dispatchEvent(createEvent("DOWNLOADER_getFileError", [error]));
      });
  },
  
/*************************************************************** state */

  /**
   * returns true if a download is in progress
   * @returns {boolean}
   */
  isLoading: function(){
    return Downloader.loading;
  },

  /**
   * returns true if Downloader is initialized, false otherwise
   * @returns {boolean}
   */
  isInitialized: function(){
    return Downloader.initialized;
  },

  /**
   * returns true if wifiOnly is set
   * @returns {boolean}
   */
  isWifiOnly: function(){
    return Downloader.wifiOnly;
  },

  /**
   * returns true if automatic unzipping is enabled
   * @returns {boolean}
   */
  isAutoUnzip: function(){
    return Downloader.autoUnzip;
  },

  /**
   * returns true if automatic deletion after unzipping is enabled
   * @returns {boolean}
   */
  isAutoDelete: function(){
    return Downloader.autoDelete;
  },

  /**
   * returns true if wifiOnly is set
   * @returns {boolean}
   */
  isWifiConnection: function(){
    var networkState = navigator.connection.type;
    if (networkState == Connection.WIFI) {
      return true;
    }
    return false;
  },

/*************************************************************** setter */

  /**
   * sets the Folder for storing the downloads
   * @param {org.apache.cordova.file.FileEntry} folder
   */
  setFolder: function(folder){
    Downloader.localFolder = folder;
  },

  /**
   * sets if it only possible to download on wifi (not on mobile connection)
   * @param {boolean} wifionly
   */
  setWifiOnly: function(wifionly){
    Downloader.wifiOnly = wifionly;
  },

  /**
   * if set to true unzippes the downloaded file when it ends with .zip
   * @param {boolean} unzip
   */
  setAutoUnzip: function(unzip){
    Downloader.autoUnzip = unzip;
  },

  /**
   * if set to true zip-files get removed after extracting
   * @param {boolean} unzip
   */
  setDelteAfterUnzip: function(del){
    Downloader.autoDelete = del;
  },

/*************************************************************** getter */

  /**
   * gets the persistent FileSystem
   */
  getFilesystem : function() {
    window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
    window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function(fileSystem) {
      document.dispatchEvent(createEvent("DOWNLOADER_gotFileSystem", [fileSystem]));
    }, function(error) {
      document.dispatchEvent(createEvent("DOWNLOADER_error", [error]));
    });
  },

  /**
   * @param {org.apache.cordova.file.FileSystem} fileSystem
   * @param {String} folderName
   */
  getFolder : function(fileSystem, folderName) {
    fileSystem.root.getDirectory(folderName, {
      create : true,
      exclusive : false
    }, function(folder) {
      document.dispatchEvent(createEvent("DOWNLOADER_gotFolder", [folder]));
    }, function(error) {
      document.dispatchEvent(createEvent("DOWNLOADER_error", [error]));
    });
  },

/*************************************************************** EventHandler */

  /**
   * @param {Object} event
   */
  onDownloadSuccess : function(event) {
    var entry = /** @type {org.apache.cordova.file.FileEntry} */ event.data[0];
    if (!Downloader.loadNextInQueue()){
      Downloader.loading = false;
    }
    if (Downloader.isAutoUnzip()){
      Downloader.unzip(entry.name);
    }
  },

  /**
   * @param {Object} event
   */
  onUnzipSuccess : function(event) {
    var fileName = /** @type {org.apache.cordova.file.FileEntry} */ event.data[0];
    if (Downloader.isAutoDelete()){
      Downloader.removeFile(fileName);
    }
  },

  /**
   * @param {Object} event
   */
  onGotFileSystem : function(event){ 
    event.target.removeEventListener(event.name, Downloader.onGotFileSystem);
    var fileSystem = /** @type {org.apache.cordova.file.FileSystem} */ event.data[0];
    Downloader.fileSystem = fileSystem;
    Downloader.getFolder(fileSystem, Downloader.localFolder);
  },

  /**
   * @param {Object} event
   * @param {org.apache.cordova.file.FileEntry} folder
   */
  onGotFolder : function(event){ 
    event.target.removeEventListener(event.name, Downloader.onGotFolder);
    var folder = /** @type {org.apache.cordova.file.FileEntry} */ event.data[0];
    Downloader.localFolder = folder;
    Downloader.initialized = true;
    console.log("initialized " + Downloader.localFolder.toURL());
    document.dispatchEvent(createEvent("DOWNLOADER_initialized"));
  },

/*************************************************************** API */

  interface : {
    init: function(options){
      if (!options.folder){
        console.error("You have to set a folder to store the downloaded files into.");
        return;
      }
      options = options || {};
      Downloader.initialize(options);
    },
    get: function(url){
      /*if (!Downloader.isInitialized()){
        console.error("You have to initialize Downloader first");
        return;
      }*/
      if (!url){
        console.error("You have to specify a url where the file is located you wanna download");
        return;
      }
      if (Downloader.isWifiOnly() && !Downloader.isWifiConnection()){
        document.dispatchEvent(createEvent("DOWNLOADER_noWifiConnection"));
        return;
      }
      Downloader.load(url);
    }
  }
};

module.exports = Downloader.interface;
