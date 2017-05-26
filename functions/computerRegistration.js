/**
 * Created by StevenD on 09/05/2017.
 */

var helper = require('./helper');
const admin = helper.admin;
const q = require('q');

module.exports.createComputerData = function createComputerData(ownerEmail, computerName){
    let def = q.defer();
    admin.auth().getUserByEmail(ownerEmail).then(owner => {
        def.resolve({
            name: computerName,
            ownerUid: owner.uid,
            users: {
                0: owner.displayName
            }
        });
    });

    return def.promise;
};