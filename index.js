const cluster = require('cluster');
const os = require('os');
const uuid = require('uuid');
const port = 3000;

//키생성 - 서버 확인용
const instance_id = uuid.v4();

/*
 * 워커 생성
 */
const cpuCount = os.cpus().length; //CPU 수
const workerCount = cpuCount / 2; //2개의 컨테이너에 돌릴 예정 CPU수 / 2

//마스터일 경우
if (cluster.isMaster) {
  console.log('서버 ID : ' + instance_id);
  console.log('서버 CPU 수 : ' + cpuCount);
  console.log('생성할 워커 수 : ' + workerCount);
  console.log(workerCount + '개의 워커가 생성됩니다\n');

  //워커 메시지 리스너
  var workerMsgListener = function (msg) {

    var worker_id = msg.worker_id;

    //마스터 아이디 요청
    if (msg.cmd === 'MASTER_ID') {
      cluster.workers[worker_id].send({ cmd: 'MASTER_ID', master_id: instance_id });
    }
  }

  //CPU 수 만큼 워커 생성
  for (var i = 0; i < workerCount; i++) {
    console.log("워커 생성 [" + (i + 1) + "/" + workerCount + "]");
    var worker = cluster.fork();

    //워커의 요청메시지 리스너
    worker.on('message', workerMsgListener);
  }

  //워커가 online상태가 되었을때
  cluster.on('online', function (worker) {
    console.log('워커 온라인 - 워커 ID : [' + worker.process.pid + ']');
  });

  //워커가 죽었을 경우 다시 살림
  cluster.on('exit', function (worker) {
    console.log('워커 사망 - 사망한 워커 ID : [' + worker.process.pid + ']');
    console.log('다른 워커를 생성합니다.');

    var worker = cluster.fork();
    //워커의 요청메시지 리스너
    worker.on('message', workerMsgListener);
  });

//워커일 경우
} else if (cluster.isWorker) {
  const express = require('express');
  const app = express();
  const request = require('request');
  const cheerio = require('cheerio');
  const bodyPaser = require('body-parser');

  const admin = require('firebase-admin');
  const key = require('./key/firebaseKey.json'); 

  admin.initializeApp({
    credential: admin.credential.cert(key),
    databaseURL: "https://running-practice.firebaseio.com"
  });

  const db = admin.firestore();

  var worker_id = cluster.worker.id;
  var master_id;

  var server = app.listen(port, function () {
    console.log("Express 서버가 " + server.address().port + "번 포트에서 Listen중입니다.");
  });

  //마스터에게 master_id 요청
  process.send({ worker_id: worker_id, cmd: 'MASTER_ID' });
  process.on('message', function (msg) {
    if (msg.cmd === 'MASTER_ID') {
      master_id = msg.master_id;
    }
  });

  // POST 방식 body를 파싱
  app.use(bodyPaser.urlencoded({ extended: true}));

  app.get('/', function (req, res) {
    res.send('root');
  })

  // 메인 페이지
  app.get('/main_page', function (req, res) {
    res.send('main_page');
  });

  // 키워드 검색 기능
  app.get('/search', function (req, res) {
    res.send('search');
  });

  // 태그 값을 이용한 필터링 검색 기능
  app.get('/search_filter', function (req, res) {
    res.send('search_filter');
  });

  // Post 좋아요 기능
  app.post('/like', function (req, res) {
    res.send('like');
  })

  /**
   * Post 작성 기능
   * POST http://106.10.34.9:3000/write_post
   * body: {
   *   client_id: string,
   *   og_title: string,
   *   og_description: string,
   *   og_img: string,
   *   og_url: string,
   *   tag: [],
   *   level: number,
   *   level_count: number
   *   time: datetime 
   * }
   */
  app.post('/write_post', function (req, res) {
    db.collection('post').add({
      'client_id': '',
      'og:title': '',
      'og:description': '',
      'og:img': '',
      'og:url': '',
      'tag': [],
      'level': 0,
      'level_count': 1,
      'time': 0,
    })
    .catch((docRef) => {
      res.send('')
    })
    .error((error) => {

    })
  });

  // Post 피드백 기능
  app.post('/feedback_post', function (req, res) {
    res.send('feedback_post');
  });

  // Post 허위 정보 신고 기능
  app.post('/report_post', function (req, res) {
    res.send('report_post');
  });

  // 좋아요한 Post들을 모아보는 기능
  app.post('/liked_post', function (req, res) {
    console.log(req.body.client_id);
    db.collection('post').where('client_id', '==', req.body.client_id).get()
      .then((docRef) => {
        docRef.forEach(doc => {
          console.log(doc.data());
          /*
            console.log('og:title: ', doc.data()['og:title']);
            console.log('og:img: ', doc.data()['og:img']);
            console.log('og:description: ', doc.data()['og:description']);
            console.log('og:url: ', doc.data()['og:url']);
            console.log('like_count: ', doc.data()['like_count']);
            console.log('level: ', doc.data()['level']);
            console.log('level_count: ', doc.data()['level_count']);
            console.log('tags: ', doc.data()['tags']);
            console.log('tag_A: ', doc.data()['tag_A']);
            console.log('tag_B: ', doc.data()['tag_B']);
          */
        });
        res.send('성공');
      })
      .catch((error) => {
        console.log('error adding document: ', error);
        res.send('실패');
      });
  })

  // URL에 대한 미리보기 정보들을 크롤링하는 기능
  // GET http://106.10.34.9:3000/analysis_url?url=https://inthewalter.github.io
  // TODO: http or https 를 안썼을 때, 받아오지 않음
  app.get('/analysis_url', function (req, res) {
    request.get({url: req.param('url')}, function(err, res2, body) {
      const $ = cheerio.load(body);
      const cnt = $("meta")
      var url_info = {};

      for (let i = 0; i < cnt.length; i++) {
        if (cnt[i]['attribs']['property'] === undefined) {
        //console.log('non-property');
        }
        else {
          url_info[cnt[i]['attribs']['property']] = cnt[i]['attribs']['content'];
        }
      }
      if (!url_info['og:title'])
        url_info['og:title'] = "null"
      if (!url_info['og:description'])
        url_info['og:description'] = "null"
      if (!url_info['og:img'])
        url_info['og:img'] = "null"
      if (!url_info['og:url'])
        url_info['og:url'] = "null"

      res.send(url_info);
    });
  });

  app.get("/workerKiller", function (req, res) {
    cluster.worker.kill();
    res.send('워커킬러 호출됨');
  });

  app.get("/firebase", function (req, res) {
    db.collection('test').add({
      test_a: 'alena',
      test_b: 'asdasd'
    })
    .then((docRef) => {
      console.log('document written with ID: ', docRef.id);
      res.send('성공');
    })
    .catch((error) => {
      console.log('error adding document: ', error);
      res.send('실패');
    })
  });
}
