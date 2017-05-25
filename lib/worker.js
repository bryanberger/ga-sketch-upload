if (process.env.NODE_ENV !== 'production') require('dotenv').config();

const Dropbox = require('dropbox'),
  dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN }),
  Promise = require('es6-promise').Promise,
  slack = require('slack'),
  fs = require('fs');

process.on('message', function(obj) {
  if(obj.msg === 'update_items') {
    dbx.filesListFolder({path: ''})
      .then(function(response) {
        var entries = response.entries;
        var actions = entries.map(function(entry) {
          return dbx.sharingListSharedLinks({path: entry.path_display, direct_only: true})
        })
        return Promise.all(actions);
      })
      .then(function(all) {
        var items = [];
        all.map(function(entry) {
          // TODO: cleaner approach to the delimiter '%' to seperate user and artboard name
          var links = entry.links;

          if(links.length > 0) {
            var entry = links[0];
            var filename = entry.name.split('%');
            var item = {
              "id": entry.id.replace('id:', ''),
              "url": entry.url+"&raw=1",
              "user": filename[0],
              "artboard": filename[1].replace(/\.[^/.]+$/, ''),
              "filename": entry.name.replace(/\.[^/.]+$/, '')
            }
            items.push(item);
          } else {
            console.log('No Links')
          }
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
        fs.unlink(obj.path);
        return response;
      })
      .then(function(response) {
        return dbx.sharingCreateSharedLinkWithSettings({path: response.path_display})
      })
      .then(function(response) {
        var filename = response.name.split('%');
        var notification = {
          user: filename[0],
          url: process.env.APP_URL + '#' + response.name.replace(/\.[^/.]+$/, '')
        }
        slack.notify(`A new <${notification.url}|work-in-progress> has been uploaded to the Design TV by ${notification.user}`);
        console.log('notification:', notification);
      })
      .catch(function(error) {
        console.log(error);
        fs.unlink(obj.path);
        process.send(null);
      });
  } else if(obj.msg === 'delete') {
    dbx.filesDelete({path: obj.path})
      .then(function(response) {
        // send null so we don't send garbage over the websocket, let update_items handle the file sync
        process.send(null);
      })
      .catch(function(error) {
        console.log(error);
        process.send(null);
      });
  }
});
