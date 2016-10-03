require('dotenv').config();
const Dropbox = require('dropbox'),
  dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN }),
  Promise = require('es6-promise').Promise,
  fs = require('fs');

process.on('message', function(obj) {
  if(obj.msg === 'update_items') {
    dbx.filesListFolder({path: ''})
      .then(function(response) {
        var entries = response.entries;
        var actions = entries.map(function(entry) {
          return dbx.sharingCreateSharedLinkWithSettings({path: entry.path_display})
        })
        return Promise.all(actions);
      })
      .then(function(all) {
        var items = [];
        all.map(function(entry) {
          // TODO: cleaner approach to the delimiter '%' to seperate user and artboard name
          var filename = entry.name.split('%');
          items.push(
            {
              "id": entry.id.replace('id:', ''),
              "url": entry.url+"&raw=1",
              "user": filename[0],
              "artboard": filename[1].replace('.png', '')
            }
          );
        });
        process.send(items);
      })
      .catch(function(error) {
        // usually a permission issue or accessToken issue
        console.log(error);
      });
  } else if(obj.msg === 'upload') {
    // TODO: cleaner approach to the delimiter '%' to seperate user and artboard name
    dbx.filesUpload({contents: fs.readFileSync(obj.path), path: '/'+obj.user + '%' + obj.filename, mode:'add', autorename: true, mute: true})
      .then(function(response) {
        console.log(response);
        fs.unlink(obj.path);
      })
      .catch(function(error) {
        console.log(error);
        fs.unlink(obj.path);
      });
  }
});
