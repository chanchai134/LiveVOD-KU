const express = require('express');
const Redis = require("ioredis");
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
const Schema = mongoose.Schema;

const multer  = require('multer');
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now()+ '-' +file.originalname)
  }
})
const upload = multer({ storage: storage });

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

const userDataSchema = new Schema({
  username: String,
  password: String,
  name: String,
  type: String,
});
var userData = mongoose.model('userData', userDataSchema);

const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const jwtCreate = require('jsonwebtoken');
const jwtSecreteKey = "EAAe4XZAAeFTgBAFSiHeOcsqETr0fL3ZAxj0ZCJaI1oOMJC3iDgsHjMpZAzwmVDi1C5msB2"
var opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: jwtSecreteKey
}

passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
	userData.findById(jwt_payload.id, function(err, user) {
    if (err) {
        return done(err, false);
    }
    if (user) {
        return done(null, user);
    } else {
        return done(null, false);
    }
  })
}))

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(passport.initialize());
const port = 3032;

var pub = new Redis(6379, 'redis');
// var sub = new Redis(6379, 'redis');
// sub.subscribe("message");
var sub = {};

app.post("/_api/message/pull", async(req, res) => {
  var data = req.body;
  var room = data.room;
  // console.log(data)
  if(typeof sub[room] === 'undefined') {
    sub[room] = new Redis(6379, 'redis');
    sub[room].subscribe(room);
  }
  const func = (_, m) => {
    var lastest = JSON.parse(m);
    res.json([lastest]);
    sub[room].removeListener("message", func);
  };
  sub[room].addListener("message", func);
});

app.post("/_api/message/push", passport.authenticate('jwt', { session: false }), (req, res) => {
  var data = req.body;
  var room = data.room
  var now = new Date();
  liveDetail.findOneAndUpdate({ _id: room }, { $push: { chat: { name: req.user.name, chat: data.chat, timestamp: now }}}, function (err, resdb) {
    pub.publish(room , JSON.stringify({ name: req.user.name, chat: data.chat, timestamp: now }));
    res.json({ timestamp: now });
  })
});

app.post('/_api/regis', function(req, res) {
  var data = req.body;
  var newUser = new userData({
    username: data.username,
    password: data.password,
    name: data.name,
    type: data.type,
  });
  newUser.save(function (err, resdb) {
    if (err) return console.log(err);
    res.json(resdb)
  })
});

app.post('/_api/login', function(req, res) {
  var data = req.body;
  userData.findOne({ username: data.username, password: data.password }, function(err, resdb) {
    if (err) return console.log(err);
    if (resdb === null) {
      res.json({ success: false })
      return
    }
    var now = new Date();
    var expireTime = now.getTime()+1.5*3600*1000;
    now.setTime(expireTime);
    res.json({
      success: true,
      name: resdb.name,
      type: resdb.type,
      cookie: jwtCreate.sign({ id: resdb._id }, jwtSecreteKey, { expiresIn: 1.5*3600 }),
      exp: now.toUTCString()
    })
  })
});

app.get('/_api/whoami', passport.authenticate('jwt', { session: false }), function(req, res) {
  res.json({ name: req.user.name, type: req.user.type })
})

app.post('/_api/upload', upload.any(), function(req, res) {
  liveDetail.findOneAndUpdate({ _id: req.body.id }, { $push: { files: { name: req.files[0].filename }}}, function (err, resdb) {
    if (err) return console.log(err);
    res.send("ok")
  })
});

var access_token = process.env.FBTOKEN || "EAAe4XZAAeFTgBALpRr8eIfkWYhZCISraZAZArech5UcuA2WfSzjwLpxoZAV3f3LkoD0UEDabwqQsSg6tpFCqgXlGt5gn9btpkwUfC5rE5eZA7VkTotGmPBiPZA4zdifuPFpYQQakuJsCtk4I1ZBk9YYfvt7uduQd2XVVP5Y1kermqsdpWDLKyANtZA8FjIqW0JLjA6ZCC98KqDZCQZDZD";

app.post('/_api/settoken', function(req, res) {
  var data = req.body;
  access_token = data.token;
  res.send(access_token);
});

app.post('/_api/addlive', passport.authenticate('jwt', { session: false }), function(req, res) {
  var data = req.body;
  console.log(data)
  var livedata = new liveDetail({
    title: data.title,
    instructor: req.user.name,
    subject: data.subject,
    dateTime: data.dateTime,
    description: data.description,
  });
  livedata.save(function (err, resdb) {
    if (err) return console.log(err);
    res.json(resdb)
    axios.post("https://graph.facebook.com/114331913362095/feed", {
      access_token: access_token,
      link: "http://35.198.225.213/video/"+resdb._id,
      message: `title: ${data.title}\n
      instructor: ${req.user.name}\n
      subject: ${data.subject}\n
      dateTime: ${new Date(data.dateTime).toLocaleString()}\n
      description: ${data.description}`
    }).then(res => {
      livedata.fb = res.data.id
      livedata.save()
    })
  });
});

app.get('/_api/getliveinstructor', passport.authenticate('jwt', { session: false }), function(req, res) {
  liveDetail.find({ instructor : req.user.name , dateTime : { $gte : new Date() }, lived: false }, null, { sort: { dateTime: 1 }}, function (err, docs) {
    res.json(docs)
  });
});

app.get('/_api/getlivetoday', function(req, res) { // today only
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0,0,0,0)
  liveDetail.find({ dateTime : { $gte : new Date(), $lte : tomorrow }, lived: false }, null, { sort: { dateTime: 1 }}, function (err, docs) {
    res.json(docs)
  });
});

app.get('/_api/toggle', function(req, res) { // today only
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0,0,0,0)
  const noww = new Date();
  liveDetail.find({ dateTime : { $gte : noww, $lte : tomorrow }, lived: false }, null, { sort: { dateTime: 1 }}, function (err, docs) {
    message = `👋✍️Today Live Schedule: ${noww.toLocaleString().split(',')[0]}\n`
    for(var i = 0; i < docs.length; i++) {
      var data = docs[i];
      message = message + `title: ${data.title}\n
      instructor: ${data.instructor}\n
      subject: ${data.subject}\n
      time:${noww.toLocaleString().split(',')[1]}\n
      description: ${data.description}\n
      ==============================================\n`
    }
    axios.post("https://graph.facebook.com/114331913362095/feed", {
      access_token: access_token,
      message: message
    })
    res.json({ success: true })
  });
});

app.get('/_api/getlivenow', function(req, res) { // live now
  axios.get('http://nms:3033/api/streams')
  .then(mns_res => {
    var mns_status = mns_res.data;
    var _id = [];
    if(typeof mns_status['live'] !== 'undefined') {
      Object.keys(mns_status['live']).forEach(id => {
        _id.push(id)
      })
    }    
    // console.log(_id) // if not match do s.th
    liveDetail.find({ _id: _id }, function (err, docs) {
      // console.log(docs)
      res.json(docs)
    })
  })
});

app.get('/_api/getall', function(req, res) {
  liveDetail.find({ ended: true }, null, { sort: { startTime: -1 }}, function (err, docs) {
    res.json(docs)
  });
});

app.post('/_api/getpage', function(req, res) {
  var data = req.body;
  var perpage = 6;
  liveDetail.find({ ended: true }, null, { sort: { startTime: -1 }, skip: (data.page-1)*perpage, limit: perpage }, function (err, docs) {
    liveDetail.find({ ended: true }).count(function (err2, count) {
      res.json({ videos: docs, maxpage: Math.ceil(count/perpage) })
    })
  });
});

app.post('/_api/getbyword', function(req, res) {
  var data = req.body;
  // console.log(data)
  liveDetail.find({ title: { $regex : `.*${data.word ? data.word : ''}.*`, $options: 'i' }, ended: true }, null, { sort: { startTime: -1 }}, function (err, docs) {
    // console.log(err)
    // console.log(docs)
    res.json(docs)
  });
});

app.post('/_api/getbyid', function(req, res) { // get detail, rtmp by id
  liveDetail.findById(req.body.id, function (err, docs) {
    res.json(docs)
  })
});

app.put('/_api/editlive', function(req, res) {
  // console.log(req.body)
  liveDetail.findOneAndUpdate({  _id: req.body.id }, req.body, function (err, docs) {
    // console.log(docs)
    if(typeof docs.fb !== 'undefined') {
      axios.post(`https://graph.facebook.com/${docs.fb}`, {
        access_token: access_token,
        message: `ขอแก้ไขรายละเอียดการถ่ายทอดสด
        title: ${docs.title}\n
        instructor: ${docs.instructor}\n
        subject: ${docs.subject}\n
        dateTime: ${new Date(docs.dateTime).toLocaleString()}\n
        description: ${docs.description}`
      })
    }
    res.json({ success: err ? false : true })
  })
});

app.post('/_api/deletelive', function(req, res) {
  liveDetail.findOneAndRemove({  _id: req.body.id }, function (err, docs) {
    // console.log(docs)
    if(typeof docs.fb !== 'undefined') {
      axios.delete(`https://graph.facebook.com/${docs.fb}?access_token=${access_token}`)
      axios.post("https://graph.facebook.com/114331913362095/feed", {
        access_token: access_token,
        message: `ขอยกเลิกการถ่ายทอดสด
        title: ${docs.title}\n
        instructor: ${docs.instructor}\n
        subject: ${docs.subject}\n
        dateTime: ${new Date(docs.dateTime).toLocaleString()}\n
        description: ${docs.description}`
      })
    }
    res.json({ success: err ? false : true })
  })
});

app.post('/_api/getinstructor', function(req, res) {
  var data = req.body;
  userData.find({ name: { $regex : `.*${data.word ? data.word : ''}.*`, $options: 'i' }, type: "t" }, function (err, docs) {
    var users = docs.map(u => ({ name: u.name }))
    res.json(users)
  });
});

app.post('/_api/getvideobyinstructor', function(req, res) {
  var data = req.body;
  liveDetail.find({ instructor : data.name, ended: true, title: { $regex : `.*${data.word ? data.word : ''}.*`, $options: 'i' } }, null, { sort: { startTime: -1 }}, function (err, docs) {
    res.json(docs)
  });
});

app.post('/_api/getsubjectbyinstructor', function(req, res) {
  var data = req.body;
  liveDetail.find({ instructor : data.name, ended: true, subject: { $regex : `.*${data.word ? data.word : ''}.*`, $options: 'i' } }, null, { sort: { startTime: -1 }}, function (err, docs) {
    const subjects = docs.map(x => x.subject).filter((value, index, self) => self.indexOf(value) === index)
    res.json(subjects)
  });
});

app.post('/_api/getsubjects', function(req, res) {
  var data = req.body;
  liveDetail.find({ subject: { $regex : `.*${data.word ? data.word : ''}.*`, $options: 'i' }}).distinct('subject', function (err, docs) {
    res.json({ subjects: docs })
  });
});

app.post('/_api/getvideobysubject', function(req, res) {
  var data = req.body;
  liveDetail.find({ subject : data.subject, ended: true, title: { $regex : `.*${data.word ? data.word : ''}.*`, $options: 'i' } }, null, { sort: { startTime: -1 }}, function (err, docs) {
    res.json(docs)
  });
});


app.listen(port, () => console.log(`listening on port ${port}!`));

module.exports = app;