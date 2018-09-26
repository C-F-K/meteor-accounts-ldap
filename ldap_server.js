Future = Npm.require('fibers/future');
NodeRSA = Npm.require('node-rsa');


// At a minimum, set up LDAP_DEFAULTS.url and .dn according to
// your needs. url should appear as 'ldap://your.url.here'
// dn should appear in normal ldap format of comma separated attribute=value
// e.g. 'uid=someuser,cn=users,dc=somevalue'
LDAP_DEFAULTS = {
    url: false,
    port: '389',
    base: null,
    dn: false,
    searchDN: false,
    searchCredentials: false,
    createNewUser: true,
    search: '(objectclass=*)',
    ldapsCertificate: false,
    customProps: null,
    customProfileFunc: null
};
LDAP = {};

// create keypair, export pubkey
const key = new NodeRSA({ b: 1024 });
const keypair = key.generateKeyPair();
publicKey = key.exportKey('public');
const Crypto = new Mongo.Collection('crypto');
Crypto.update(
    { _id: 'accounts-ldap' },
    { public: { key: publicKey } },
    { upsert: true }
);

Meteor.startup(() => {
    Meteor.publish('crypto',() => {
        return Crypto.find({ _id: 'accounts-ldap' });
    })
});

/**
 * @method getFilterFromSearchObject
 * 
 * @param {Object} obj
 * object with a single field, being the key/value of the ldap attribute the user is logging in with
 * which should be used to find the DN to bind with
 * 
 * someday, implement logic to handle lots of search params
 */
function getFilterFromSearchObject(obj) {
    let keys = Object.keys(obj);
    /* 
    let result = '(';
    if (obj.keys.length = 1) {
        result + obj.keys[0] + '=' + obj[obj.keys[0]];
    } else {
        obj.keys.forEach(e => {
            // etc etc etc
        });
    }
    result += ')';
    */  

    return '(' + keys[0] + '=' + obj[keys[0]] + ')';
}

/**
 @class LDAP
 @constructor
 */
LDAP.create = function (options) {
    // Set options
    this.options = _.defaults(options, LDAP_DEFAULTS);

    // prepare object for custom profile shenanigans
    this.profileBones = {};

    // Make sure options have been set
    try {
        check(this.options.url, String);
        check(MeteorWrapperLdapjs.parseDN(this.options.dn), MeteorWrapperLdapjs.dn.DN);
        check(MeteorWrapperLdapjs.parseDN(this.options.base), MeteorWrapperLdapjs.dn.DN);
    } catch (e) {
        throw new Meteor.Error('Bad Defaults', 'Options not set. Make sure to set LDAP_DEFAULTS.url, LDAP_DEFAULTS.dn and LDAP_DEFAULTS.base');
    }

    // Create ldap client
    const fullUrl = this.options.url + ':' + this.options.port;

    const connectedClient = new Future();
    
    const ldapClient = this.options.url.indexOf('ldaps://') === 0 ? 
        MeteorWrapperLdapjs.createClient({
            url: fullUrl,
            tlsOptions: {
                ca: [this.options.ldapsCertificate]
            }
        }) : 
        MeteorWrapperLdapjs.createClient({
            url: fullUrl
        })
    ;

    ldapClient.on('connect',() => {
        connectedClient.return(ldapClient);
    });

    this.ldapClient = connectedClient.wait();
};

/**
 * Attempt to bind (authenticate) ldap
 * and perform a dn search if specified
 *
 * @method ldapCheck
 *
 * @param {Object} [request]  Object with username, ldapPass and overrides for LDAP_DEFAULTS object.
 * Additionally the searchBeforeBind parameter can be specified, which is used to search for the DN
 * if not provided.
 * @param {boolean} [bindAfterFind]  Whether or not to try to login with the supplied credentials or
 * just return whether or not the user exists.
 */
LDAP.create.prototype.ldapCheck = function (request = {}) {
    /* someday, refactor this to use Promises instead of Futures */
    const ldapAsyncFut = new Future();

    if (!(request.hasOwnProperty('username') && request.hasOwnProperty('ldapPass')))  {
        ldapAsyncFut.throw(new Meteor.Error(400, 'LDAP credentials missing'));
    } else if (!(["string","object"].includes(typeof request.username) && /string/.test(typeof request.ldapPass))) {
        ldapAsyncFut.throw(new Meteor.Error(400, 'LDAP credentials are the wrong type(s)'));
    } else {
        /* this.options ends up as ldapOptions on request */
        var bindDN;
        var bound = false;
        if (request.ldapOptions.hasOwnProperty('searchBeforeBind') && /object/.test(typeof request.ldapOptions.searchBeforeBind)) {
            this.ldapClient.bind(this.options.searchDN, this.options.searchCredentials, (err) => {
                if (err) {
                    console.error("can't bind with supplied search creds");
                    console.error(err);
                    /* Future resolves more than once error? */
                    ldapAsyncFut.throw({
                        error: err
                    });
                } else {
                    let searchOpts = {
                        scope: 'sub',
                        sizeLimit: 1,
                        paged: true,
                        attributes: 'dn',
                        filter: getFilterFromSearchObject(request.ldapOptions.searchBeforeBind)
                    }
                    this.ldapClient.search(this.options.base, searchOpts, (err,res) => {
                        if (err) {
                          /* Future resolves more than once error? */
                            ldapAsyncFut.throw({
                                error: err
                            });
                        } else {
                            res.on('searchEntry',entry => {
                                bound = true;
                                bindDN = entry.object.dn;
                                if (request.ldapOptions.customProfileFunc) {
                                    this.profileBones = request.ldapOptions.customProfileFunc(entry.object);
                                }

                                this.loginWithDN(ldapAsyncFut, bindDN, request);
                            });
                            res.on('error', err => {
                                console.error("ldap search error:");
                                console.error(err);
                                ldapAsyncFut.throw({
                                    error: err
                                });
                            });
                            res.on('end', result => {
                                console.log("searchBeforeBind complete");
                                console.log("status: " + result.status);
                                this.ldapClient.unbind(err => {
                                    if (err) {
                                        console.error(err);
                                    }
                                });
                                if (!bound) {
                                    ldapAsyncFut.throw({
                                        error: new Meteor.Error(401, "user not known in LDAP")
                                    });
                                }
                            });
                        }
                    });
                }
            });
        } else {
            /* no searchBeforeBind */

            /* set bindDN here... using username? 
                idk tbh this is rudimentary 
                since i think one should actually expect people to never login with their actual DN */
            bindDN = 'CN=' + request.username;
            this.loginWithDN(ldapAsyncFut, bindDN, request);
        }
    }

    const result = ldapAsyncFut.wait();
    return result;
};

/**
 * @method loginWithDN  this method needs encapsulating to solve async-related errors; it may also solve the multi-
 * resolving future error let's see
 * 
 * @param {Future} ldapAsyncFut future object 
 * 
 * @param {String} bindDN   DN to attempt a login bind with - either found or supplied
 * 
 * @param {Object} request  request object to pass in
 */

LDAP.create.prototype.loginWithDN = function (ldapAsyncFut, bindDN, request) {
    if (!bindDN) {
        ldapAsyncFut.throw({
            error: new Meteor.Error(500, "No bind DN on which to authenticate")
        });
    }
    this.ldapClient.bind(bindDN, request.ldapPass, err => {
        if (err) {
            ldapAsyncFut.throw({
                error: err
            });
        } else {
            ldapAsyncFut.return({
                username: request.username
            });
        }
    });
} 

// Register login handler with Meteor
// Here we create a new LDAP instance with options passed from
// Meteor.loginWithLDAP on client side
// @param {Object} loginRequest will consist of username, ldapPass, ldap, and ldapOptions
Accounts.registerLoginHandler('ldap', function (loginRequest) {
    var decryptedPass = key.decrypt(loginRequest.ldapPass).toString();
    loginRequest.ldapPass = decryptedPass;
    // If 'ldap' isn't set in loginRequest object,
    // then this isn't the proper handler (return undefined)
    if (!loginRequest.ldap) {
        return undefined;
    }

    // Instantiate LDAP with options
    var userOptions = loginRequest.ldapOptions;
    Accounts.ldapObj = new LDAP.create(userOptions);

    // Call ldapCheck and get response
    const ldapResponse = Accounts.ldapObj.ldapCheck(loginRequest);
    if (ldapResponse.error) {
        return {
            userId: null,
            error: ldapResponse.error
        };
    } else {
        // Set initial userId and token vals
        var userId = null;
        var stampedToken  = Accounts._generateStampedLoginToken();

        // Look to see if user already exists
        var user = Meteor.users.findOne({
            username: ldapResponse.username
        });

        // Login user if they exist
        if (user) {
            userId = user._id;
            Accounts.setPassword(userId, loginRequest.ldapPass);

            // Create hashed token so user stays logged in
            var hashStampedToken = Accounts._hashStampedToken(stampedToken);
            // Update the user's token in mongo
            Meteor.users.update(userId, {
                $push: {
                    'services.resume.loginTokens': hashStampedToken
                }
            });
        }
        // Otherwise create user if option is set
        else if (Accounts.ldapObj.options.createNewUser) {
            var userObject = {
                username: ldapResponse.username,
            };

            if (Accounts.ldapObj.options.customProps) {
                userObject = _.defaults(userObject, _.extend(Accounts.ldapObj.options.customProps, Accounts.ldapObj.profileBones));
            }

            userId = Accounts.createUser(userObject);
            Accounts.setPassword(userId, loginRequest.ldapPass);

            var hashStampedToken = Accounts._hashStampedToken(stampedToken);
            // Update the user's token in mongo
            Meteor.users.update(userId, {
                $push: {
                    'services.resume.loginTokens': hashStampedToken
                }
            });
        } else {
            // Ldap success, but no user created
            console.log('LDAP Authentication succeeded for ' + ldapResponse.username + ', but no user exists in Meteor. Either create the user manually or set LDAP_DEFAULTS.createNewUser to true');
            return {
                userId: null,
                error: new Meteor.Error(403, 'User found in LDAP but not in application')
            };
        }

        return {
            userId: userId,
            token: stampedToken.token
        };
    }
});