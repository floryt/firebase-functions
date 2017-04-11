require('@google-cloud/debug-agent').start({ allowExpressions: true });

var functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// Adds a message that welcomes new users into the chat.
exports.addWelcomeMessages = functions.auth.user().onCreate(event => {
  const user = event.data;
  console.log('A new user signed in for the first time.');

  // Saves the new welcome message into the database
  // which then displays it in the FriendlyChat clients.
  return admin.database().ref('Users').push({
    name: user.displayName || 'None',
    email: user.email || 'None',
    UID: user.uid || 'None',
    photoUrl: user.photoURL || 'None'
  });
});

exports.sendWelcomNotification = functions.database.ref('Tokens/{UUID}/').onWrite(event=>{
    var registrationToken = event.data.val();
    if(registrationToken == null){
        return;
    }
    // See the "Defining the message payload" section below for details
    // on how to define a message payload.
    var payload = {
    notification: {
        title: 'Welcom to floryt'
      }
    };
    console.log(registrationToken);
    // Send a message to the device corresponding to the provided
    // registration token.
    return admin.messaging().sendToDevice(registrationToken, payload)
        .then(function(response) {
            // See the MessagingDevicesResponse reference documentation for
            // the contents of response.
            console.log("Successfully sent message:", response);
        })
        .catch(function(error) {
            console.log("Error sending message:", error);
        });
});

exports.DllCommunication = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    if(req.method == "GET"){
        res.status(200).send('OK');
    }
    else if(req.method == 'POST')
    {
        console.log(req.body);
        const username = req.body.username;
        const computerUID = req.body.computerUID;
        var answer = {
            access: getPromition(username, computerUID),
            message: 'Custom massage from admin'
        };
        answer = JSON.stringify(answer);

        res.status(200).send(answer);
    }
    else
    {
        res.status(404).send('Method not supported')
    }
});

exports.DllCommunicationDelay = functions.https.onRequest((req, res) => {
    console.log("Got: ", req.method);
    if(req.method == "GET"){
        setTimeout(function() {
            res.status(200).send('OK');
        }, 10000);
    }
    else if(req.method == 'POST')
    {
        console.log(req.body);
        const username = req.body.username;
        const computerUID = req.body.computerUID;
        setTimeout(function() {
            var answer = {
                access: getPromition(username, computerUID),
                message: 'delayed massage from admin'
            };
            answer = JSON.stringify(answer);
            res.status(200).send(answer);
        }, 10000);
    }
    else
    {
        res.status(404).send('Method not supported')
    }
});

function getPromition(username, computerUID) {
    var adminUIDs = findAdmins(computerUID);
    var userUID = getUIDByUsername(username);
    adminUIDs.forEach(function(adminUID) {
        sendNotification(adminUID, username, computerUID);
    }, this);
    sendNotification(userUID, username, computerUID);
    return username === 'Steven' && computerUID === "123456789"? true: false;
}

function findAdmins(params) {return new Array(0);}
function getUIDByUsername(params) {return 0;}
function sendNotification(userUID, username, computerUID) {}


// exports.date = functions.https.onRequest((req, res) => {
// // [END trigger]
//   // [START sendError]
//   // Forbidding PUT requests.
//   if (req.method === 'PUT') {
//     res.status(403).send('Forbidden!');
//   }
//   // [END sendError]

//   // [START usingMiddleware]
//   // Enable CORS using the `cors` express middleware.
//   cors(req, res, () => {
//   // [END usingMiddleware]
//     // Reading date format from URL query parameter.
//     // [START readQueryParam]
//     let format = req.query.format;
//     // [END readQueryParam]
//     // Reading date format from request body query parameter
//     if (!format) {
//       // [START readBodyParam]
//       format = req.body.format;
//       // [END readBodyParam]
//     }
//     // [START sendResponse]
//     const formattedDate = moment().format(format);
//     console.log('Sending Formatted date:', formattedDate);
//     res.status(200).send(formattedDate);
//     // [END sendResponse]
//   });
// });