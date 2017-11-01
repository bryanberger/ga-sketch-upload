process.env.NODE_PATH = __dirname + '/lib/'; // KLUDGE: had todo this for the worker.js
if (process.env.NODE_ENV !== 'production') require('dotenv').config()

const express     = require('express'),
  contentType     = require('content-type'),
  getRawBody      = require('raw-body'),
  crypto          = require('crypto'),
  cprocess        = require('child_process'),
  os                = require('os'),
  cp              = require('fs-cp'),
  path            = require('path');

const extensions  = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov']
const app         = express()
const expressWs   = require('express-ws')(app)

//
// app.use(views(__dirname + '/views', {extension: 'pug'}))
// app.use(serve(__dirname + '/public'));
app.set('views', './views')
app.set('view engine', 'pug')
app.use(express.static(__dirname + '/public'))
app.use(defaultContentTypeMiddleware)
app.use(textMiddleware)
app.get('/', index)
app.ws('/', websocket)
app.get('/single', single)
app.get('/video', video)
app.get('/webhooks', webhooks_get)
app.post('/webhooks', webhooks_post)
// app.use(route.get('/', index));
// app.use(route.get('/single', single));
// app.use(route.get('/video', video));
// app.use(route.get('/webhooks', webhooks_validate));
// app.use(route.post('/webhooks', text));
// app.use(route.post('/webhooks', webhooks_post));
// app.use(route.post('/upload', upload));
// app.use(route.post('/remove', remove));

let items = []

// Routes

function defaultContentTypeMiddleware (req, res, next) {
  req.headers['content-type'] = req.headers['content-type'] || 'text/html'
  next()
}

function textMiddleware(req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: contentType.parse(req).parameters.charset
  }, function (err, string) {
    if (err) return next(err)
    req.text = string
    next()
  })
}

function index(req, res, next) {
  res.render('index', { items: items, port: process.env.PORT || 3000 })
}

function single(req, res, next) {
  res.render('single')
}

function video(req, res, next) {
  res.render('video')
}

function webhooks_get(req, res, next) {
  // validate by returning the challenge
  res.status(200)
  res.send(req.query['challenge'])
}

function webhooks_post(req, res, next) {
  if(!isValidRequest(req.headers, req.text)) {
    res.status(403)
    res.end()
  }

  // return success ASAP
  res.status(200)
  res.send()

  // child execute the update
  createWorker({msg: 'update_items'})
}

function isValidRequest(headers, rawBody) {
  var signature = headers['x-dropbox-signature'],
      hash = crypto.createHmac('SHA256', process.env.DROPBOX_APP_SECRET).update(rawBody).digest('hex')
  return signature == hash
}

// Web Socket Routes
function websocket(ws, req) {
  if(items.length === 0) {
    // get intial items for first user
    createWorker({msg: 'update_items'})
  } else {
    // send cached ones
    ws.send(items)
  }

   // the websocket is added to the context as `this.websocket`.
  ws.on('message', function(message) {
    console.log(message)
  })

  // yielding `next` will pass the context (this) on to the next ws middleware
  next()
}

app.ws.broadcast = function broadcast(data) {
  var s = expressWs.getWss('/')

  s.clients.forEach(function each(client) {
    client.send(data)
  })
}

// Workers

function createWorker(msg) {
  var child = cprocess.fork(path.join(__dirname + '/lib/worker'))

  child.on('message', function(_items) {
    if(_items === 'error' || _items === null) {
      child.kill()
      return
    }

    items = _items
    app.ws.broadcast(JSON.stringify(items))
    child.kill()
  });

  child.send(msg)
}

//
// function *text(next) {
//   this.text = yield getRawBody(this.req, {
//     length: this.req.headers['content-length'],
//     limit: '1mb',
//     encoding: contentType.parse(this.req).parameters.charset
//   });
//
//   yield next;
// };
//
// // async function index(ctx) {
// //   await ctx.render('index', { items: items, port: process.env.PORT || 3000 })
// // }
//
// async function single(ctx) {
//   await ctx.render('single');
// }
//
// async function video(ctx) {
//   await ctx.render('video');
// }
//
// async function webhooks_validate(ctx) {
//   ctx.body = ctx.request.query['challenge'];
// }
//
// function *webhooks_post(next) {
//   if(!isValidRequest(this.request.headers, this.text)) {
//     this.status = 403;
//     return yield next;
//   }
//
//   // return success ASAP
//   this.status = 200;
//
//   // child execute the update
//   createWorker({msg: 'update_items'});
// };
//
// function *remove(next) {
//
//   console.log(this.request.query);
//   //
//   // var parts = parse(this, {
//   //   autoFields: true,
//   //   checkFile: function(path) {
//   //     if (extensions.indexOf(path.extname(path)) === -1) {
//   //       var err = new Error('invalid path');
//   //       err.status = 400;
//   //       return err;
//   //     }
//   //   },
//   //   checkField: function(name, value) {
//   //     if (name === 'id' && value !== process.env.SKETCH_TOKEN) {
//   //       var err = new Error('invalid token');
//   //       err.status = 400;
//   //       return err;
//   //     }
//   //   }
//   // });
//
//   // child execute the upload
//   //createWorker({msg: 'delete', filepath: part.path});
//
//   // return JSON back to sketchplugin
//   this.body = JSON.stringify({status: 'success'});
// };
//
// function *upload(next) {
//   if (!this.request.is('multipart/*')) return yield next;
//
//   var parts = parse(this, {
//     autoFields: true,
//     checkFile: function(fieldname, file, filename) {
//       if (extensions.indexOf(path.extname(filename)) === -1) {
//         var err = new Error('invalid filetype');
//         err.status = 400;
//         return err;
//       }
//     },
//     checkField: function(name, value) {
//       if (name === 'id' && value !== process.env.SKETCH_TOKEN) {
//         var err = new Error('invalid token');
//         err.status = 400;
//         return err;
//       }
//     }
//   });
//
//   // create a tmpdir
//   var tmpdir = path.join(os.tmpdir(), uid());
//   yield fs.mkdir(tmpdir);
//
//   var part, filePath;
//   while (part = yield parts) {
//     filePath = part.path = path.join(tmpdir, uid());
//     yield cp(part, part.path);
//   }
//
//   // child execute the upload
//   createWorker({msg: 'upload', path: filePath, filename: parts.field.filename, user: parts.field.user});
//
//   // return JSON back to sketchplugin
//   this.body = JSON.stringify({status: 'success'});
// };
//
// function isValidRequest(headers, rawBody) {
//     var signature = headers['x-dropbox-signature'],
//         hash = crypto.createHmac('SHA256', process.env.DROPBOX_APP_SECRET).update(rawBody).digest('hex');
//     return signature == hash;
// };
//
// function uid() {
//   return Math.random().toString(36).slice(2);
// };
//
// function createWorker(msg) {
//   var child = cprocess.fork(path.join(__dirname + '/lib/worker'));
//
//   child.on('message', function(items) {
//     if(items === 'error' || items === null) {
//       child.kill();
//       return;
//     }
//
//     items = items;
//     app.ws.broadcast(JSON.stringify(items));
//     child.kill();
//   });
//
//   child.send(msg);
// }
//
// app.ws.use(route.get('/', function (ctx) {
//   if(items.length === 0) {
//     // get intial items for first user
//     createWorker({msg: 'update_items'});
//   } else {
//     // send cached ones
//     this.websocket.send(items);
//   }
//
//    // the websocket is added to the context as `this.websocket`.
//   this.websocket.on('message', function(message) {
//     console.log(message);
//   });
//
//   // yielding `next` will pass the context (this) on to the next ws middleware
//   return next(ctx);
// }));
//
// app.ws.broadcast = function broadcast(data) {
//   app.ws.server.clients.forEach(function each(client) {
//     client.send(data);
//   });
// };

app.listen(process.env.PORT || 3000);
console.log(process.version + ' listening on port ' + (process.env.PORT||3000));
