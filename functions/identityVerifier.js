/**
 * Created by Steven on 5/1/2017.
 */

var helper = require('./helper');
var request = require('request');
const admin = helper.admin;
const q = require('q');


module.exports.verifyIdentity = function verifyIdentity(email, computerUid) {
    let def = q.defer();
    let userUid;

    helper.getSnapshot(admin.database().ref('Computers').child(computerUid)).then(snapshot =>{
        let computer = snapshot.val();
        console.log(`Computer found: ${computer}`);
        if (!computer.name){
            def.resolve({isVerified: false, message: 'This computer is not registered.'});
        } else{
            return admin.auth().getUserByEmail(email);
        }
    })
        .then(user => {
            userUid = user.uid;
            return helper.getTokenByUid(userUid);
        },
        reason => {
            console.error("Failed to get user by email:", reason);
            def.resolve({isVerified: false, message: 'This user does not exists.'});
        })

        // getTokenByUid
        .then(token => {
            return sendIdentityVerificationRequest(token, userUid, computerUid);
        },
        reason => {
            def.resolve({
                isVerified: false,
                message: 'This user is not connected to the app. Please connect and try again.'
            });
        })

        // sendIdentityVerificationRequest
        .then(verificationUid => {
            return obtainIdentityVerification(userUid, verificationUid);
        },
        reason => {
            def.resolve({isVerified: true, message: 'User can not get verification message. Please try again.'});
        })

        // obtainIdentityVerification
        .then(({identityVerification, message}) => {
            def.resolve({isVerified: identityVerification, message: message});
        })

        // Unhandled rejection or exception
        .catch(error => {
            console.error('Error in verification:', error);
            def.reject();
        });

    return def.promise;
};

/**
 * Listens for change in the database (IdentityVerifications/{verificationUid}/{userUid}).
 * If there is no change in 2 minutes,
 * listening stops and returned {identityVerification: false, message: 'timeout reached'}
 * @param {string} userUid
 * @param {string} verificationUid
 * @return {JSON} {boolean} identityVerification, {string} massage
 **/
function obtainIdentityVerification(userUid, verificationUid) {
    let def = q.defer();
    console.log(`Waiting for verification from ${userUid}`);
    let timeout = 1000 * 120;
    let verificationRef = admin.database().ref("IdentityVerifications").child(verificationUid);

    console.log(`Started watchdog on ${verificationRef}, for ${timeout} milliseconds`);
    let timeoutGuard;
    timeoutGuard = setTimeout(() => {
        console.log(`User identity was not verified in a ${timeout / 1000} time frame.`);
        verificationRef.off(); //Remove listener
        def.resolve({
            identityVerification: false,
            message: `User identity was not verified in a ${timeout / 1000} seconds time frame.`
        });
    }, timeout);

    verificationRef.on('child_added', snapshot => {
        let identityFlag = snapshot.val();
        console.log(`Found value: ${snapshot.key}:${identityFlag}`);
        if (snapshot.key !== userUid) {
            console.log(`Got irrelevant trigger`);
            return;
        }
        clearTimeout(timeoutGuard);
        def.resolve(identityFlag ? {identityVerification: true} : {
            identityVerification: false,
            message: 'Identity was not verified'
        });
        verificationRef.off();
        verificationRef.child(userUid).remove().then(() => {
            console.log('Verification cleared successfully');
        });
    });
    return def.promise;
}

function sendIdentityVerificationRequest(token, userUid, computerUid) {
    console.log('Sending verification request to:', token);
    let def = q.defer();
    let verificationUid = admin.database().ref("IdentityVerifications").push().key;
    createVerificationPayload(userUid, verificationUid, computerUid).then(payload => {
        console.log('Sending:', payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log('Successfully sent message:', response);
                def.resolve(verificationUid);
            })
            .catch(error => {
                console.error("Error sending message:", error);
                def.reject();
            });
    }).catch(error => {
        console.error("Error creating verification payload:", error);
        def.reject();
    });
    return def.promise;
}

function createVerificationPayload(userUid, verificationUid, computerUid) {
    let def = q.defer();
    admin.auth().getUser(userUid).then(user => {
        console.log('Creating payload about user:', JSON.stringify(user));
        admin.database().ref('Computers').child(computerUid).on('value', snapshot => {
            let computer = snapshot.val();
            console.log(`Found computer: ${JSON.stringify(computer)}`);
            request(`http://freegeoip.net/json/${computer.ip}`, function (error, response, body) {
                console.log('error:', error); // Print the error if one occurred
                console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
                console.log('body:', body); // Print the HTML for the Google homepage.
                body = JSON.parse(body);
                let payload =
                    {
                        data: {
                            messageType: 'identity',
                            userName: user.displayName,
                            computerName: computer.name,
                            computerIp: computer.ip || '',
                            deadline: (Math.round(new Date().getTime()/1000.0) + 120).toString(),
                            computerLatitude: body.latitude.toString(),
                            computerLongitude: body.longitude.toString(),
                            verificationUid: verificationUid
                        }
                    };
                def.resolve(payload);
            });
        });
    });
    return def.promise;
}


module.exports.logIdentityVerification = function logIdentityVerification(email, computerUid, answer, time) {
    let guest;
    console.log('Logging identity verification');
    console.log(`answer: ${JSON.stringify(answer)}`);
    helper.safeGetUserByEmail(admin.auth().getUserByEmail(email)).then(guest_ => {
        console.log(`Guest: ${JSON.stringify(guest_)}`);
        guest = guest_;
        return helper.getSnapshot(admin.database().ref('Computers').child(computerUid));
    }).then(snapshot => {
        let computer = snapshot.val();
        console.log(`Computer: ${computer.name}`);

        if (!computer.name) {
            answer.message = 'The computer you tried to sign in to is not registered.';
            answer.access = false;
        }

        // log to guest activity
        if (guest){
            admin.database().ref('Users').child(guest.uid).child('activityLog').push().set(
                {
                    type: 'Identity verification',
                    result: answer.access ? "Verified" : "Not verified",
                    message: answer.message || null,
                    computerName: computer.name || null,
                    time: time,
                    negtime: 0-time
                }
            ).then(() => {
                console.log('Successfully logged activity in guest\'s profile');
            }).catch(console.error);
        }

        if (computer.ownerUid){ //log if there is a computer owner
            if (guest) //if there is a guest
                if(guest.uid === computer.ownerUid) return; //check if the guest is the owner
            //log to owner activity
            let message;

            message = `Identity of ${guest ? `${guest.displayName} (${guest.email})` : `unknown user (${email})`} was ${answer.access ? "verified" : "not verified"}${answer.message ? ': ' + answer.message : ''}`;
            admin.database().ref('Users').child(computer.ownerUid).child('activityLog').push().set(
                {
                    type: 'Identity verification',
                    result: answer.access ? "Verified" : "Not verified",
                    message: message,
                    computerName: computer.name,
                    time: time,
                    negtime: 0-time
                }
            ).then(() => {
                console.log('Successfully logged activity in owners profile');
            }).catch(console.error);
        }
        //TODO: Save log in the computer activity log
    }).catch(console.error);
};