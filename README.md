# phonegap-downloader
Phonegap plugin to download a List of files or a single file to the Phone, check consistency and unzip if necessary (Android and ios)

WARNING: It's not done yet!
- not tested
- md5 checksums not implemented
- mass-download not implemented

## install
```
yourAppDir$ phonegap plugin add https://github.com/fastrde/phonegap-downloader.git
```

## usage
```javascript
downloader.init({folder: "yourPersistantAppFolder", unzip: true});
downloader.get("http://yourhost.de/some.zip");
```
