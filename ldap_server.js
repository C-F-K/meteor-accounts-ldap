Future = Npm.require('fibers/future');
// encrypt = Npm.require('jsencrypt');

// At a minimum, set up LDAP_DEFAULTS.url and .dn according to
// your needs. url should appear as 'ldap://your.url.here'
// dn should appear in normal ldap format of comma separated attribute=value
// e.g. 'uid=someuser,cn=users,dc=somevalue'
LDAP_DEFAULTS = {
    url: false,
    port: '389',
    dn: false,
    searchDN: false,
    searchCredentials: false,
    createNewUser: true,
    base: null,
    search: '(objectclass=*)',
    ldapsCertificate: false
};
LDAP = {};

/**
 @class LDAP
 @constructor
 */
LDAP.create = function (options) {
    // Set options
    this.options = _.defaults(options, LDAP_DEFAULTS);

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
    this.ldapClient = this.options.url.indexOf('ldaps://') === 0 ? 
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
        /* self.options ends up as ldapOptions on request */
        var bindDN;
        if (request.ldapOptions.hasOwnProperty('searchBeforeBind') && /object/.test(typeof request.ldapOptions.searchBeforeBind)) {
            this.ldapClient.bind(this.options.searchDN, this.options.searchCredentials, (err) => {
                if (err) {
                    console.error("can't bind with supplied search creds");
                    console.error(err);
                    /* Future resolves more than once error? */
                    // ldapAsyncFut.throw({
                    //     error: err
                    // });
                } else {
                    let searchOpts = {
                        scope: 'sub',
                        sizeLimit: 1,
                        // attributes: 'dn',
                        // filter: this.options.search /* include this? seems overzealous to apply it here */
                    }
                    this.ldapClient.search(this.options.base, searchOpts, (err,res) => {
                        if (err) {
                        /* Future resolves more than once error? */
                            // ldapAsyncFut.throw({
                            //     error: err
                            // });
                        } else {
                            res.on('searchEntry',entry => {
                                console.log("entry:");
                                console.log(entry.object);
                                bindDN = entry.object.dn;
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
                            });
                        }
                    });
                }
            });
        }

        if (!bindDN) {
            ldapAsyncFut.throw({
                error: new Meteor.Error(500, "No bind DN on which to authenticate")
            });
        }
        console.log("bindDN: " + bindDN);
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

        const result = ldapAsyncFut.wait();
        return result;
    } 
};


// Register login handler with Meteor
// Here we create a new LDAP instance with options passed from
// Meteor.loginWithLDAP on client side
// @param {Object} loginRequest will consist of username, ldapPass, ldap, and ldapOptions
Accounts.registerLoginHandler('ldap', function (loginRequest) {
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
        var stampedToken;

        // Look to see if user already exists
        var user = Meteor.users.findOne({
            username: ldapResponse.username
        });

        // Login user if they exist
        if (user) {
            userId = user._id;

            // Create hashed token so user stays logged in
            stampedToken = Accounts._generateStampedLoginToken();
            var hashStampedToken = Accounts._hashStampedToken(stampedToken);
            // Update the user's token in mongo
            Meteor.users.update(userId, {
                $push: {
                    'services.resume.loginTokens': hashStampedToken
                }
            });
            Accounts.setPassword(userId, loginRequest.ldapPass);
        }
        // Otherwise create user if option is set
        else if (Accounts.ldapObj.options.createNewUser) {
            var userObject = {
                username: ldapResponse.username
            };
            userId = Accounts.createUser(userObject);
            Accounts.setPassword(userId, loginRequest.ldapPass);
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