var helper = require('./helper');
const admin = helper.admin;
const q = require('q');

module.exports.getCommand = function getCommand(computerUid){
    let def = q.defer();
    console.log(`Getting command of computer ${computerUid}`);
    helper.getSnapshot(admin.database().ref('Commands').child(computerUid)).then(snapshot => {
        let commandData = snapshot.val();
        let command = '';
        admin.database().ref('Commands').child(computerUid).remove().then(() => {console.log('Command cleared')});
        console.log('Snapshot:', JSON.stringify(commandData));

        if (Object.keys(commandData).length > 0){
            let ownerUid = Object.keys(commandData)[0];
            console.log(`OwnerUid: ${JSON.stringify(ownerUid)}`);

            let commands = commandData[ownerUid];
            console.log(`Commands: ${JSON.stringify(commands)}`);

            if (Object.keys(commands).length > 0){
                command = commands[Object.keys(commands)[0]];
                console.log(`First command: ${JSON.stringify(command)}`);
                console.log(typeof command['second']);
                command = {
                    command: command['first'],
                    message: typeof command['second'] === 'string' || command['second'] instanceof String ? command['second'] : undefined
                }
            }
        }

        def.resolve(command);
    }).catch(err => {
        console.error(err);
        def.resolve({
            command: 'null'
        });
    });
    return def.promise;
};