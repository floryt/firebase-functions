

var q = require('q');


function getUser(){
    var def = q.defer();

    // database
    // .then

    var user = {
        'username': 'steven'
    };

    def.resolve(user);

    return def.promise;
}

getUser()
    .then(function (user) {
        console.log(user);
    })
    .catch(function () {
        console.error('bummer');
    });
