const key = new NodeRSA({ b: 1024 });
const Crypto = new Mongo.Collection('crypto');
Meteor.startup(() => {
    Meteor.subscribe('crypto',() => {
        Session.set('publicKey',Crypto.findOne({ _id: 'vpn-control' }));
        key.importKey(Session.get('publicKey').public.key,'public');
    });
});

// Pass in username, password as normal
// customLdapOptions should be passed in if you want to override LDAP_DEFAULTS
// on any particular call (if you have multiple ldap servers you'd like to connect to)
// You'll likely want to set the dn value here {dn: "..."}
Meteor.loginWithLDAP = function (user, password, customLdapOptions, callback) {
    // Set up loginRequest object
    var loginRequest = _.defaults({
        username: user,
        ldapPass: key.encrypt(password)
    }, {
        ldap: true,
        ldapOptions: customLdapOptions
    });

    Accounts.callLoginMethod({
        // Call login method with ldap = true
        // This will hook into our login handler for ldap
        methodArguments: [loginRequest],
        userCallback: function (error, result) {
            if (error) {
                callback && callback(error);
            } else {
                callback && callback();
            }
        }
    });
};