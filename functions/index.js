require('@google-cloud/debug-agent').start({ allowExpressions: true });

var helper = require('./helper');
var identityVerifier = require('./identityVerifier');
var permissionObtainer = require('./permissionObtainer');
var functions = helper.functions;
const q = require('q');

//TODO handle notification screen after time out
exports.obtainIdentityVerification = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    console.log(req.body);
    const email = req.body.email;
    identityVerifier.verifyIdentity(email).then(({isVerified, message}) => {
        let answer = {
            access: isVerified,
            message: message
        };
        answer = JSON.stringify(answer);
        console.log("Sent: ", answer);
        res.status(200).send(answer);
    })
    .catch(error => {
        console.log("Failed to verify user: ", error);
        res.status(200).send({
            access: false,
            message: "internal error"
        });
    });
});

exports.obtainAdminPermission = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    console.log(req.body);
    const guestEmail = req.body.email;
    const computerUID = req.body.computerUID;
    permissionObtainer.obtainPermission(guestEmail , computerUID).then(({isPermitted, message}) => {
        let answer = {
            access: isPermitted,
            message: message
        };
        answer = JSON.stringify(answer);
        console.log("Sent: ", answer);
        res.status(200).send(answer);
    }).catch((error) => {
        console.log("Failed to verify user: ", error);
        res.status(200).send({
            access: false,
            message: `internal error: ${error.message}`
        });
    });
});

exports.connectivityCheck = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    res.status(200).send("OK");
});

exports.DLLmock = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    res.status(200).send({access: true, message: "I love pizza!"});
});
