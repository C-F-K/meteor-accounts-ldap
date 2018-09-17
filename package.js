Package.describe({
  name: 'cfk:accounts-ldap',
  version: '1.1.1',
  summary: 'Fork of typ\'s Accounts login for LDAP using ldapjs. Supports anonymous DN search & LDAPS. Added since forking: explicitly declared underscore, pubkey encrypt ldap creds',
  git: 'https://github.com/C-F-K/meteor-accounts-ldap',
  documentation: 'README.md'
});

Npm.depends({
  jsencrypt: '3.0.0-rc1'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0.3.1');

  api.use(['templating'], 'client');
  api.use(['typ:ldapjs@0.7.3'], 'server');

  api.use('accounts-base', 'server');
  api.imply('accounts-base', ['client', 'server']);
  api.imply('accounts-password', ['client', 'server']);
  api.imply('underscore', ['client', 'server']);
  api.imply('session', 'client');

  api.use('check');

  api.addFiles(['ldap_client.js'], 'client');
  api.addFiles(['ldap_server.js'], 'server');

  api.export('LDAP', 'server');
  api.export('LDAP_DEFAULTS', 'server');
});
