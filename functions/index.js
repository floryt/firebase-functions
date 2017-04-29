require('@google-cloud/debug-agent').start({ allowExpressions: true });

var functions = require('firebase-functions');
const admin = require('firebase-admin');
const q = require('q');
admin.initializeApp(functions.config().firebase);
//TODO handle notification screen after time out
exports.obtainIdentityVerification = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    if (req.method !== 'POST') {
        res.status(404).send('Method not supported');
        return;
    }
    console.log(req.body);
    const email = req.body.email;
    verifyIdentity(email).then(({isVerified, message}) => {
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
    const email = req.body.email;
    const computerUID = req.body.computerUID;
    obtainPermission(email, computerUID).then(({isPermitted, message}) => {
        let answer = {
            access: isPermitted,
            message: message || ''
        };
        answer = JSON.stringify(answer);
        console.log("Sent: ", answer);
        res.status(200).send(answer);
    }).catch((error) => {
        console.log("Failed to verify user: ", error);
        res.status(200).send({
            access: false,
            message: "internal error"
        });
    });
});

exports.connectivityCheck = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    res.status(200).send("OK");
});

function obtainPermission(email, computerUID) {
    let def = q.defer();

    getUIDByEmail(email).then(userUID => {
        return getTokenByUID(userUID);
    }).then(({token, userUID}) => {
        return sendNotification(token, userUID, computerUID);
    }).then((userUID) => {
        def.resolve({isPermitted: true});
    }).catch((error) => {
        console.log("Error in getting permission: ", error);
        def.reject();
    });

    return def.promise;
}

function verifyIdentity(email) {
    let def = q.defer();
    getUIDByEmail(email).then(userUID => {
        return getTokenByUID(userUID);
    }).then(({token, userUID}) => {
        return sendIdentityVerificationRequest(token, userUID);
    }).then(userUID => {
        return obtainIdentityVerification(userUID);
    }).then(({identityVerification, message}) =>{
        def.resolve({isVerified: identityVerification, message: message});
    }).catch(error => {
        console.log("Error in verification: ", error);
        def.reject();
    });

    return def.promise;
}

function getUIDByEmail(email) {
    console.log("Getting UID of ", email);
    let def = q.defer();
    admin.auth().getUserByEmail(email)
        .then(userRecored => {
            console.log("Got UID: ", userRecored.uid);
            def.resolve(userRecored.uid);
        }).catch(error => {
            console.log("Error getting UID: ", error);
            def.reject();
        });
    return def.promise;
}

function getTokenByUID(userUID) {
    console.log("Getting token of ", userUID);
    let def = q.defer();
    if (userUID === undefined) {
        def.reject();
        return def.promise;
    }
    admin.database().ref('Users').child(userUID).child('deviceToken')
        .on('value', snapshot => {
            console.log("Got token: ", snapshot.val());
            def.resolve({token: snapshot.val(), userUID: userUID});
        });
    return def.promise;
}

function sendNotification(token, userUID, computerUID) {
    console.log("Sending notification to: ", token);
    let def = q.defer();
    
    createPermissionRequestPayload(userUID, computerUID).then(payload => {
        console.log("Sending: ", payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                // See the MessagingDevicesResponse reference documentation for the contents of response.
                console.log("Successfully sent message:", response);
                def.resolve(userUID);
            })
            .catch(error => {
                console.log("Error sending message:", error);
                def.reject();
            });
    });

    return def.promise;
}

function createVerificationPayload(userUID) {
    let def = q.defer();
    admin.auth().getUser(userUID).then(user => {
        console.log("User: ", user.toJSON());
        let payload =
            {
                data: {
                    priority: 'high',
                    userEmail: user.email,
                    userName: user.displayName,
                    userPhotoUrl: user.photoURL
                }
            };
        def.resolve(payload);
    });
    return def.promise;
}

function sendIdentityVerificationRequest(token, userUID){
    console.log("Sending verification request to: ", token);
    let def = q.defer();
    createVerificationPayload(userUID).then(payload => {
        console.log("Sending: ", payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log("Successfully sent message:", response);
                def.resolve(userUID);
            })
            .catch(error => {
                console.log("Error sending message:", error);
                def.reject();
            });
    });
    return def.promise;
}

/**
 * Listens for change in the database (IdentityVerifications/{userUID}).
 * If there is no change in 2 minutes,
 * listening stops and returned {identityVerification: false, message: 'timeout reached'}
 * @param {string} userUID
 * @return {JSON} {boolean} identityVerification, {string} massage
**/
function obtainIdentityVerification(userUID){
    let def = q.defer();
    console.log(`Waiting for verification from ${userUID}`);
    let timeout = 1000 * 120;
    let verificationRef = admin.database().ref("IdentityVerifications");

    console.log(`Started watchdog on ${verificationRef}, for ${timeout} milliseconds`);
    let timeoutGuard;
    timeoutGuard = setTimeout(() => {
        console.log("Reached timeout");
        verificationRef.off(); //Remove listener
        def.resolve({identityVerification: false, message: 'Reached timeout'});
    }, timeout);

    verificationRef.on('child_added', snapshot => {
        let identityFlag = snapshot.val();
        console.log(`Found value change: ${snapshot.key}:${identityFlag}`);
        if (snapshot.key !== userUID){
            console.log(`Got irrelevant trigger`);
            return;
        }
        clearTimeout(timeoutGuard);
        if(identityFlag){
            def.resolve({identityVerification: true});
        }else{
            def.resolve({identityVerification: false, message: 'Rejected by user'});
        }
        console.log(`Finished handling database change, promise state is ${def.promise.inspect().state}`);
        verificationRef.child(userUID).remove().then(() => {
            console.log('Verification cleared successfully');
        });
    });
    return def.promise;
}

function createPermissionRequestPayload(userUID, computerUID) {
    console.log("Creating payload about user: ", userUID);
    let def = q.defer();
    admin.auth().getUser(userUID).then(user => {
        console.log("User: ", user.toJSON());
        console.log(user.displayName, user.email, user.photoURL);
        let payload =
            {
                data: {
                    priority: 'high',
                    userEmail: user.email,
                    userName: user.displayName,
                    userPhotoUrl: user.photoURL,
                    computer: computerUID,
                }
            };
        console.log("Created payload: ", payload);
        def.resolve(payload);
    }).catch(error => {
        console.log("Failed to create payload: ", error);
        def.reject();
    });
    return def.promise;
}

// function createNotification(title, body, priority = "high") {
//     return {
//         notification: {
//             priority: "high",
//             title: title,
//             body: body
//         }
//     };
// }