const NodeMediaServer = require('node-media-server');

const mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
const Schema = mongoose.Schema;
mongoose.connect('mongodb://mongo/livevod', {useNewUrlParser: true, useUnifiedTopology: true});
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log('db connected');
});

const liveDetailSchema = new Schema({
  title: String,
  instructor: String,
  subject: String,
  dateTime: Date,
  startTime: Date,
  lived: { type: Boolean, default: false },
  ended: { type: Boolean, default: false }, 
  description: String,
  files: [{ name: String }],
  fb: String,
  chat: [{ name: String, chat: String, timestamp: Date }],
});
var liveDetail = mongoose.model('liveDetail', liveDetailSchema);

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 3033,
    allow_origin: '*',
    mediaroot: './M'
  },
  trans: {
    ffmpeg: process.env.ISDOCKER ? '/usr/bin/ffmpeg' : './bin/ffmpeg.exe',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_playlist_type=event]'
      }
    ]
  }
};

var nms = new NodeMediaServer(config)
nms.run();

nms.on('prePublish', (id, StreamPath, args) => {
  var _id = StreamPath.split('/')[2];
  var now = new Date();
  liveDetail.findOneAndUpdate({ _id: _id }, { startTime: now, lived: true, chat: [] }, function (err, resdb) {})
});

nms.on('donePublish', (id, StreamPath, args) => {
  var _id = StreamPath.split('/')[2];
  liveDetail.findOneAndUpdate({ _id: _id }, { ended: true }, function (err, resdb) {})
});
