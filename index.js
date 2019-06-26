const cluster = require('cluster');
const os = require('os');
const uuid = require('uuid');
const port = 3000;

//키생성 - 서버 확인용
const instance_id = uuid.v4();

/**
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

    const admin = require('firebase-admin');
    const key = {
			/*
			*/
    }
    admin.initializeApp({
        credential: admin.credential.cert(key)
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

    app.get('/analysis_url', function (req, res) {
			//request.get({url: 'https://inthewalter.github.io/'}, function(err, res, body) {
			let arr = []
			request.get({url: 'https://dev.to/ananyaneogi/html-can-do-that-c0n'}, function(err, res2, body) {
				const $ = cheerio.load(body);
				console.log("start");
				const cnt = $("meta")
				for (let i = 0; i < cnt.length; i++) {
					if (cnt[i]['attribs']['property'] === undefined) {
						//console.log('non-property');
					}
					else {
						const data = {
							property : cnt[i]['attribs']['property'],
							content : cnt[i]['attribs']['content']
						}
						arr.push(data);
						console.log(data);
					}
				}
				console.log("end");
			res.send(arr);
			});
        //res.send('안녕하세요 저는<br>[' + master_id + ']서버의<br>워커 [' + cluster.worker.id + '] 입니다.');
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
        });
    });
}
