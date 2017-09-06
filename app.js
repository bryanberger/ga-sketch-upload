process.env.NODE_PATH = __dirname + '/lib/'; // KLUDGE: had todo this for the worker.js
if (process.env.NODE_ENV !== 'production') require('dotenv').config();

const koa = require('koa'),
  logger = require('koa-logger'),
  route = require('koa-route'),
  body = require('koa-body'),
  websockify = require('koa-websocket'),
  serve = require('koa-static'),
  contentType = require('content-type'),
  render = require('./lib/render'),
  parse = require('co-busboy'),
  getRawBody = require('raw-body'),
  crypto = require('crypto'),
  cprocess = require('child_process'),
  fs = require('co-fs'),
  os = require('os'),
  cp = require('fs-cp'),
  path = require('path');

const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov']
const app = websockify(koa());
app.use(logger());
app.use(serve(__dirname + '/public'));
app.use(route.post('/webhooks', text));
app.use(route.get('/', index));
app.use(route.get('/video', video));
app.use(route.get('/webhooks', webhooks_validate));
app.use(route.post('/webhooks', webhooks_post));
app.use(route.post('/upload', upload));
app.use(route.post('/remove', remove));

var items = [];

function *text(next) {
  this.text = yield getRawBody(this.req, {
    length: this.req.headers['content-length'],
    limit: '1mb',
    encoding: contentType.parse(this.req).parameters.charset
  });

  yield next;
};

function *index() {
  this.body = yield render('index', { items: items, port: process.env.PORT || 3000 });
};

function *video() {
  this.body = yield render('video');
};

function *webhooks_validate() {
  this.body = this.request.query['challenge'];
};

function *webhooks_post(next) {
  if(!isValidRequest(this.request.headers, this.text)) {
    this.status = 403;
    return yield next;
  }

  // return success ASAP
  this.status = 200;

  // child execute the update
  createWorker({msg: 'update_items'});
};

function *remove(next) {

  console.log(this.request.query);
  //
  // var parts = parse(this, {
  //   autoFields: true,
  //   checkFile: function(path) {
  //     if (extensions.indexOf(path.extname(path)) === -1) {
  //       var err = new Error('invalid path');
  //       err.status = 400;
  //       return err;
  //     }
  //   },
  //   checkField: function(name, value) {
  //     if (name === 'id' && value !== process.env.SKETCH_TOKEN) {
  //       var err = new Error('invalid token');
  //       err.status = 400;
  //       return err;
  //     }
  //   }
  // });

  // child execute the upload
  //createWorker({msg: 'delete', filepath: part.path});

  // return JSON back to sketchplugin
  this.body = JSON.stringify({status: 'success'});
};

function *upload(next) {
  if (!this.request.is('multipart/*')) return yield next;

  var parts = parse(this, {
    autoFields: true,
    checkFile: function(fieldname, file, filename) {
      if (extensions.indexOf(path.extname(filename)) === -1) {
        var err = new Error('invalid filetype');
        err.status = 400;
        return err;
      }
    },
    checkField: function(name, value) {
      if (name === 'id' && value !== process.env.SKETCH_TOKEN) {
        var err = new Error('invalid token');
        err.status = 400;
        return err;
      }
    }
  });

  // create a tmpdir
  var tmpdir = path.join(os.tmpdir(), uid());
  yield fs.mkdir(tmpdir);

  var part, filePath;
  while (part = yield parts) {
    filePath = part.path = path.join(tmpdir, uid());
    yield cp(part, part.path);
  }

  // child execute the upload
  createWorker({msg: 'upload', path: filePath, filename: parts.field.filename, user: parts.field.user});

  // return JSON back to sketchplugin
  this.body = JSON.stringify({status: 'success'});
};

function isValidRequest(headers, rawBody) {
    var signature = headers['x-dropbox-signature'],
        hash = crypto.createHmac('SHA256', process.env.DROPBOX_APP_SECRET).update(rawBody).digest('hex');
    return signature == hash;
};

function uid() {
  return Math.random().toString(36).slice(2);
};

function createWorker(msg) {
  var child = cprocess.fork(path.join(__dirname + '/lib/worker'));

  child.on('message', function(items) {
    if(items === 'error' || items === null) {
      child.kill();
      return;
    }

    items = items;
    app.ws.broadcast(JSON.stringify(items));
    child.kill();
  });

  child.send(msg);
}

app.ws.use(route.get('/', function* (next) {
  if(items.length === 0) {
    // get intial items for first user
    createWorker({msg: 'update_items'});
  } else {
    // send cached ones
    this.websocket.send(items);
  }

   // the websocket is added to the context as `this.websocket`.
  this.websocket.on('message', function(message) {
    console.log(message);
  });

  // yielding `next` will pass the context (this) on to the next ws middleware
  yield next;
}));

app.ws.broadcast = function broadcast(data) {
  app.ws.server.clients.forEach(function each(client) {
    client.send(data);
  });
};

app.listen(process.env.PORT || 3000);
console.log(process.version + ' listening on port ' + (process.env.PORT||3000));
