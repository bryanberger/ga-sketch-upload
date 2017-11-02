process.env.NODE_PATH = __dirname + '/lib/'; // KLUDGE: had todo this for the worker.js
if (process.env.NODE_ENV !== 'production') require('dotenv').config()

const express     = require('express'),
  contentType     = require('content-type'),
  getRawBody      = require('raw-body'),
  crypto          = require('crypto'),
  cprocess        = require('child_process'),
  os              = require('os'),
  fs              = require('fs'),
  path            = require('path'),
  multer          = require('multer'),
  app             = express(),
  expressWs       = require('express-ws')(app)

// Upload Settings

const filetypes  = /jpeg|jpg|png|gif|mp4|mov/

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir())
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})

function fileFilter(req, file, cb) {
  var mimetype = _filetypes.test(file.mimetype)
  var extname = _filetypes.test(path.extname(file.originalname).toLowerCase())

  if (mimetype && extname) {
    return cb(null, true)
  }

  cb(`Error: File upload only supports the following filetypes - ${filetypes}`)
}

const uploader    = multer({storage: storage, fileFilter: fileFilter}).single('sketchartboard')

// Express
app.set('views', './views')
app.set('view engine', 'pug')
app.use(express.static(__dirname + '/public'))
app.use(defaultContentTypeMiddleware)
app.get('/', index)
app.ws('/', websocket)
app.get('/single', single)
app.get('/video', video)
app.post('/upload', uploader, upload)
app.use(textMiddleware)
app.get('/webhooks', webhooks_get)
app.post('/webhooks', webhooks_post)
// app.use('/remove', remove)

// Dropbox Item objects
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

function upload(req, res, next) {
  // If token is incorrect
  if (req.body.id !== process.env.SKETCH_TOKEN) {
    var err = new Error('invalid token')
    res.status(400).end()
    return
  }

  var user = req.body.user

  // Upload
  uploader(req, res, function(err) {
    // If errors, end
    if(err) {
      res.status(400).end()
      return
    }

    console.log(`file uploaded to: ${req.file.path}`)

    // Child execute the upload
    createWorker({msg: 'upload', path: req.file.path, filename: req.file.filename, user: user})

    // Return JSON back to sketchplugin
    res.send(JSON.stringify({ status: 'success' }))
  })
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

  // yielding `next` will pass the context on to the next ws middleware
  next()
}

// Workers

function createWorker(msg) {
  var child = cprocess.fork(path.join(__dirname + '/lib/worker'))

  child.on('message', function(_items) {
    if(_items === 'error' || _items === null) {
      child.kill()
      return
    }
    console.log(items)

    items = _items
    app.ws.broadcast(JSON.stringify(items))
    child.kill()
  })

  child.send(msg)
}

// Helpers

function isValidRequest(headers, rawBody) {
  var signature = headers['x-dropbox-signature'],
      hash = crypto.createHmac('SHA256', process.env.DROPBOX_APP_SECRET).update(rawBody).digest('hex')
  return signature == hash
}

app.ws.broadcast = function broadcast(data) {
  var s = expressWs.getWss('/')

  s.clients.forEach(function(client) {
    client.send(data)
  })
}

// Start app
app.listen(process.env.PORT || 3000)
console.log(process.version + ' listening on port ' + (process.env.PORT||3000))
