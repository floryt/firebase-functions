var fs = require("fs");
var helper = require('./helper');
var identityVerifier = require('./identityVerifier');
var permissionObtainer = require('./permissionObtainer');
var computerRegistration = require('./computerRegistration');
var service = require('./service');
var functions = helper.functions;
const gcs = require('@google-cloud/storage')();
const admin = helper.admin;
const q = require('q');

exports.obtain_identity_verification = functions.https.onRequest((req, res) => {
    console.log(`Got method: ${req.method}, with body: ${JSON.stringify(req.body)}`);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    const email = req.body.email;
    const computerUid = req.body.computerUid;
    const time = Math.round(new Date().getTime()/1000.0);
    const ip = helper.getIp(req);
    console.log('ip:', ip);

    admin.database().ref('Computers').child(computerUid).child('ip').set(ip)
        .then(()=>{
            return identityVerifier.verifyIdentity(email, computerUid);
        })
        .then(({isVerified, message}) => {
            let answer = {
                access: isVerified,
                message: message
            };
            identityVerifier.logIdentityVerification(email, computerUid, answer, time);
            answer = JSON.stringify(answer);
            console.log('Sent:', answer);
            res.status(200).send(answer);
        })
        .catch(error => {
            console.error('Failed to verify user:', error);
            res.status(200).send({
                access: false,
                message: "internal error"
            });
        });
});

exports.obtain_admin_permission = functions.https.onRequest((req, res) => {
    console.log(`Got method: ${req.method}, with body: ${JSON.stringify(req.body)}`);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    const guestEmail = req.body.email;
    const computerUid = req.body.computerUid;
    const time = Math.round(new Date().getTime()/1000.0);
    const ip = helper.getIp(req);
    console.log('ip:', ip);
    admin.database().ref('Computers').child(computerUid).child('ip').set(ip)
        .then(()=>{
            return permissionObtainer.obtainPermission(guestEmail, computerUid);
        })
        .then(({isPermitted, message}) => {
            let answer = {
                access: isPermitted,
                message: message
            };
            permissionObtainer.logPermissionRequest(guestEmail,computerUid, answer, time);
            answer = JSON.stringify(answer);
            console.log('Sent:', answer);
            res.status(200).send(answer);
        })
        .catch((error) => {
            console.error('Failed to get permission from admin:', error);
            res.status(200).send({
                access: false,
                message: `internal error: ${error.message}`
            });
        });
});

exports.connectivity_check = functions.https.onRequest((req, res) => {
    console.log('Got:', req.method);
    res.status(200).send("OK");
});

exports.dll_mock = functions.https.onRequest((req, res) => {
    console.log('Got:', req.method);
    res.status(200).send({access: true, message: "I love pizza!"});
});

exports.service_mock = functions.https.onRequest((req, res) => {
    console.log(`Got: ${req.method}, with data: ${JSON.stringify(req.body)}`);
    const i = req.body.i;
    const items = ['lock', 'shutdown', 'take_screenshot', 'present_message'];
    const item = items[i];
    let response = {
        command: item,
        message: item === 'present_message' ? 'Custom message' : undefined
    };
    console.log(`Send: ${JSON.stringify(response)}`);
    res.status(200).send(response);
});

exports.service = functions.https.onRequest((req, res) => {
    console.log(`Got: ${req.method}, with data: ${JSON.stringify(req.body)}`);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    const computerUid = req.body.computerUid;
    service.getCommand(computerUid).then(command => {
        console.log(`Send: ${JSON.stringify(command)}`);
        res.status(200).send(command);
    });
});

exports.upload_screenshot = functions.https.onRequest((req, res) => {
    console.log(`Got: ${req.method}, with data: ${JSON.stringify(req.body)}`);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }

    const computerUid = req.body.computerUid;
    const base64image = req.body.image;
    const base64Data = base64image.replace(/^data:image\/png;base64,/, "");
    const bucket = gcs.bucket();


    bucket.file(`Screenshots/${computerUid}/index`).download( { destination : '/tmp/index' } ).then(() =>{
        fs.readFile('/tmp/index', 'utf8', function(err, contents) {
            if (err){
                console.error(err);
                res.status(500).send('error');
                return;
            }
            console.log(contents);
            let uuid = parseInt(contents, 10);
            fs.writeFile('/tmp/index', uuid + 1, console.error);
            bucket.upload('/tmp/index', {
                destination: `Screenshots/${computerUid}/index`
            });
            let tempLocalFile = `/tmp/${uuid}.png`;

            fs.writeFile(tempLocalFile, base64Data, 'base64', console.error);
            bucket.upload(tempLocalFile, {
                destination: `Screenshots/${computerUid}/${uuid}.png`
            }).then(() => {
                res.status(200).send('ok');
            }).catch(() => {
                res.status(500).send('error');
            });
        });
    }, () => {
        console.log('Creating nex index');
        fs.writeFile('/tmp/index', 0, console.error);
        bucket.upload('/tmp/index', {
            destination: `Screenshots/${computerUid}/index`
        }).then(() => {
            bucket.file(`Screenshots/${computerUid}/index`).download( { destination : '/tmp/index' } ).then(() =>{
                fs.readFile('/tmp/index', 'utf8', function(err, contents) {
                    if (err){
                        console.error(err);
                        res.status(500).send('error');
                        return;
                    }
                    console.log(contents);
                    let uuid = parseInt(contents, 10);
                    fs.writeFile('/tmp/index', uuid + 1, console.error);
                    bucket.upload('/tmp/index', {
                        destination: `Screenshots/${computerUid}/index`
                    });

                    let tempLocalFile = `/tmp/${uuid}.png`;

                    fs.writeFile(tempLocalFile, base64Data, 'base64', console.error);
                    bucket.upload(tempLocalFile, {
                        destination: `Screenshots/${computerUid}/${uuid}.png`
                    }).then(() => {
                        res.status(200).send('ok');
                    }).catch(() => {
                        res.status(500).send('error');
                    });
                });
            });
            res.status(200).send('ok');
        }).catch(() => {
            res.status(500).send('error');
        });
    });
});

exports.computer_registration = functions.https.onRequest((req, res) => {
    console.log('Got:', req.method);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    console.log(req.body);
    const ownerEmail = req.body.email;
    const computerName = req.body.computerName;
    const computerUid = req.body.Uid;
    computerRegistration.createComputerData(ownerEmail, computerName).then(data => {
        return helper.admin.database().ref('Computers').child(computerUid).set(data);
    }).then(() => {
        res.status(200).send('OK');
    }).catch((error) => {
        console.log('Failed to register computer:', error);
        res.status(200).send({
            access: false,
            message: `internal error: ${error.message}`
        });
    });
});

exports.computer_mirroring = functions.database.ref('/Computers/{computerUid}').onWrite(event => {
    let computerData = event.data.val();
    let ownerUid = computerData.ownerUid;
    delete computerData.ownerUid;
    console.log(`Found change on ${event.data.key} with owner ${ownerUid}`);
    if (ownerUid === undefined){ return; }
    return admin.database().ref(`Users/${ownerUid}/computers/`).child(event.data.key).set(computerData);
});
