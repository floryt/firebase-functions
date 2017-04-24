require('@google-cloud/debug-agent').start({ allowExpressions: true });

var functions = require('firebase-functions');
const admin = require('firebase-admin');
const q = require('q')
admin.initializeApp(functions.config().firebase);

exports.addUserToDatabase = functions.auth.user().onCreate(event => {
    const user = event.data;
    console.log('A new user signed in for the first time.');
    return admin.database().ref('Users').child(user.uid).set({
        name: user.displayName || 'None',
        email: user.email || 'None',
        photoUrl: user.photoURL || 'None'
    });
});

exports.DllCommunication = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    if (req.method == "GET") {
        res.status(200).send('OK');
    }
    else if (req.method == 'POST') {
        console.log(req.body);
        const email = req.body.email;
        const computerUID = req.body.computerUID;
        const isGuest = req.body.isGuest;
        getPromition(email, computerUID)
            .then((isApproved) => {
            var answer = {
                access: isApproved,
                message: 'Custom massage from admin'
            };
            answer = JSON.stringify(answer);
            console.log("Sent: ", answer);
            res.status(200).send(answer);
            });
    }
    else {
        res.status(404).send('Method not supported');
    }
});

function getPromition(email, computerUID) {
    var def = q.defer();

    getUIDByemail(email).then((uid) => {
        return getTokenByUID(uid, email, computerUID);
    }).then((token) => {
        return sendNotification(token, email, computerUID);
    }).then((isSent) => {
        def.resolve(isSent);
    }).catch((error) => {
        console.log("Error in getting promition: ", error);
        def.reject();
    });

    return def.promise;
}

function findAdminsByComputer(params) {
    var def = q.defer();

    return def.promise;
}

function getUIDByemail(email) {
    console.log("Getting UID of ", email);
    var def = q.defer();
    admin.auth().getUserByEmail(email)
        .then(function (userRecored) {
            console.log("Got UID: ", userRecored.uid);
            def.resolve(userRecored.uid);
        }).catch((error) => {
            console.log("Error getting UID: ", error);
            def.reject();
        });
    return def.promise;
}

function getTokenByUID(uid) {
    console.log("Getting token of ", uid);
    var def = q.defer();
    if (uid == undefined) {
        def.reject();
        return def.promise;
    }
    var db = admin.database();
    var usersRef = db.ref('Users');
    var userRef = usersRef.child(uid);
    userRef.child('deviceToken')
        .on('value', snapshot => {
            console.log("Got token: ", snapshot.val());
            def.resolve(snapshot.val());
        });
    return def.promise;
}

function sendNotification(token, email, computerUID) {
    console.log("Sending notification to: ", token);
    var def = q.defer();

    var payload =
        {
            data: {
                priority: 'high',
                userEmail: email,
                computer: computerUID,
            },
            notification: {
                priority: "high",
                title: email + ' wants to enter your PC',
                body: computerUID
            }
        };
    console.log("Sending: ", payload);
    admin.messaging().sendToDevice(token, payload)
        .then(function (response) {
            // See the MessagingDevicesResponse reference documentation for the contents of response.
            console.log("Successfully sent message:", response);
            def.resolve(true);
        })
        .catch(function (error) {
            console.log("Error sending message:", error);
            def.reject();
        });

    return def.promise;
}

function createNotification(title, body, priority = "high") {
    return {
        notification: {
            priority: "high",
            title: title,
            body: body
        }
    };
}