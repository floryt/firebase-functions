require('@google-cloud/debug-agent').start({allowExpressions: true});

var helper = require('./helper');
var identityVerifier = require('./identityVerifier');
var permissionObtainer = require('./permissionObtainer');
var computerRegistration = require('./computerRegistration');
var functions = helper.functions;
const q = require('q');

exports.obtain_identity_verification = functions.https.onRequest((req, res) => {
    console.log(`Got method: ${req.method}, with body: ${JSON.stringify(req.body)}`);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    const email = req.body.email;
    identityVerifier.verifyIdentity(email)
        .then(({isVerified, message}) => {
            let answer = {
                access: isVerified,
                message: message
            };
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
    permissionObtainer.obtainPermission(guestEmail, computerUid)
        .then(({isPermitted, message}) => {
            let answer = {
                access: isPermitted,
                message: message
            };
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
