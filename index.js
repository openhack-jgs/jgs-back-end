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
  // CORS Allow
  app.all('/*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
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
  app.use(bodyPaser.urlencoded({ extended: true }));

  app.get('/', function (req, res) {
    res.send('root');
  })

  // 메인 페이지
  app.get('/main_page', function (req, res) {
    var stacks;
    var posts;
    var stacks_arr = [];
    var posts_arr = [];
    var json_arr = [];
    db.collection('stack').get()
      .then((docRef) => {
        docRef.forEach(doc => {
          stacks = JSON.stringify(doc.data());
          stacks_arr.push(stacks);
        })
        json_arr.push(stacks_arr);
      })
      .catch((error) => {
        console.log('error get document: ', error);
        res.send('실패');
      });
    
    // 최근에 작성된 글 10개를 조회
    db.collection('post').orderBy('time', 'desc').limit(10).get()
      .then((docRef) => {
        docRef.forEach(doc => {
          posts = JSON.stringify(doc.data());
          posts_arr.push(posts);
        })
        json_arr.push(posts_arr);
        console.log(json_arr);
        res.send(json_arr);
      })
      .catch((error) => {
        console.log('error get document: ', error);
        res.send('실패');
      });
  });

  // 키워드 검색 기능
  app.get('/search', function (req, res) {
    var posts;
    var posts_arr = [];
    if (req.query.keyword != null) {
      db.collection('post').where('tag.' + req.query.keyword, '==', true).get()
      .then((docRef) => {
        docRef.forEach(doc => {
          posts = JSON.stringify(doc.data());
          posts_arr.push(posts);
        })
        console.log(posts_arr);
        res.send(posts_arr);
      })
      .catch((error) => {
        console.log('error get document: ', error);
        res.send('실패');
      });
    }
  });

  // 태그 값을 이용한 필터링 검색 기능
  app.get('/search_filter', function (req, res) {
    var posts;
    var posts_arr = [];
    if (req.query.stack != null && req.query.tag != null) {
      db.collection('post').where('tag.' + req.query.stack, '==', true).where('tag.' + req.query.tag, '==', true).get()
      .then((docRef) => {
        docRef.forEach(doc => {
          posts = JSON.stringify(doc.data());
          posts_arr.push(posts);
        })
        console.log(posts_arr);
        res.send(posts_arr);
      })
      .catch((error) => {
        console.log('error get document: ', error);
        res.send('실패');
      });
    }
    else if (req.query.stack != null && req.query.tag == null) {
      db.collection('post').where('tag.' + req.query.stack, '==', true).get()
      .then((docRef) => {
        docRef.forEach(doc => {
          posts = JSON.stringify(doc.data());
          posts_arr.push(posts);
        })
        console.log(posts_arr);
        res.send(posts_arr);
      })
      .catch((error) => {
        console.log('error get document: ', error);
        res.send('실패');
      });
    }
    else {
      res.send('please check filter!!!')
    }
  });

  // Post 좋아요 기능
  app.post('/like', function (req, res) {
    var post_id = req.body.post_id;
    let count;
    console.log(post_id);
    db.collection('post').where('post_id', '==', post_id).get()
      .then((docRef) => {
        docRef.forEach(doc => {
            count = doc.data()['like_count'];
            console.log(count);
            count += 1;
          })
          db.collection('post').doc(post_id).update({
            like_count: count
          }).then(() => {
            res.status(200);
            res.send('OK');
          }).catch((error) => {
            console.log(error);
            res.send('FAIL'); 
          })
      })
      .catch((error) => {
        console.log('error get document: ', error);
        res.send('실패');
      });
  });

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
   * }
   */
  app.post('/write_post', function (req, res) {
    let post_info = req.body;
    post_info['level_count'] = 1;
    post_info['time'] = Date();
    post_info['comment'] = []
    post_info['level'] = Number(post_info['level']);

    db.collection('post').add(post_info)
    .then((docRef) => {
      db.collection('post').doc(docRef.id).update({
        post_id: docRef.id
      }).then(() => {
        res.status(200);
        res.send('OK');
      }).catch((error) => {
        console.log(error);
        res.send('FAIL'); 
      })
    }).catch((error) => {
      console.log(error);
      res.send('FAIL');
    })
  });

  /**
   * post 피드백 기능
   * POST http://106.10.34.9:3000/feedback_post
   * body: {
   *   client_id: string,
   *   post_id: string,
   *   level: number,
   *   comment: string
   * }
   */
  app.post('/feedback_post', function (req, res) {
    let feedback_info = req.body;
    feedback_info['time'] = Date();
    db.collection('post').doc(feedback_info['post_id']).get()
    .then((docSnapshot) => {
      let post_info = docSnapshot.data()
      post_info['level_count'] += 1
      post_info['level'] = Number(post_info['level']) + Number(feedback_info['level']);
      post_info['comment'].push(feedback_info['comment'])
      db.collection('post').doc(feedback_info['post_id']).update(post_info);

      res.send('OK');
    })
    .catch((error) => {
      res.send('FAIL');
      console.log(error);
    })
  });

  // Post 허위 정보 신고 기능
  app.post('/report_post', function (req, res) {
    res.send('report_post');
  });

  // 좋아요한 Post들을 모아보는 기능
  app.post('/liked_post', function (req, res) {
    var posts;
    db.collection('user').where('client_id', '==', req.body.client_id).get()
      .then((docRef) => {
        docRef.forEach(doc => {
          doc.data()['liked_posts'].forEach(post_id => {
            db.collection('post').where('post_id', '==', post_id).get()
            .then((docRef2) => {
              docRef2.forEach(doc2 => {
                posts = JSON.stringify(doc2.data());
                /*
                  console.log('og:title: ', doc2.data()['og:title']);
                  console.log('og:img: ', doc2.data()['og:img']);
                  console.log('og:description: ', doc2.data()['og:description']);
                  console.log('og:url: ', doc2.data()['og:url']);
                  console.log('like_count: ', doc2.data()['like_count']);
                  console.log('level: ', doc2.data()['level']);
                  console.log('level_count: ', doc2.data()['level_count']);
                  console.log('tags: ', doc2.data()['tags']);
                  console.log('tag_A: ', doc2.data()['tag_A']);
                  console.log('tag_B: ', doc2.data()['tag_B']);
                */
              })
              res.send(posts);
            })
            .catch((error) => {
              console.log('error get document: ', error);
              res.send('실패');
            });
          })
        });
      })
      .catch((error) => {
        console.log('error get document: ', error);
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
      if (!url_info['og:image'])
        url_info['og:image'] = "null"
      if (!url_info['og:url'])
        url_info['og:url'] = "null"

      res.send(url_info);
    });
  });

  app.get("/workerKiller", function (req, res) {
    cluster.worker.kill();
    res.send('워커킬러 호출됨');
  });
}
