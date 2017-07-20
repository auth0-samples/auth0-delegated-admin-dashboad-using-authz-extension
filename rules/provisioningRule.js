function provisioningRule (user, context, callback) {  
  var LOG_PREFIX = 'provisioningRule: ';

  // configure these:
  var FEDERATED_CONNECTION = 'federated-connection';
  var PROVISIONED_USERS_CONNECTION = 'provisioned-users-connection';

  var Promise = require('bluebird');
  var request = require('request-promise');

  // bail if not a federated user
  if (context.connection !== FEDERATED_CONNECTION) {
    return callback(null, user, context);
  }

  function clientCredentials (audience) {
    return request.post({
      url: 'https://' + auth0.domain + '/oauth/token',
      json:{
        grant_type: 'client_credentials',
        client_id: configuration.PROVISIONING_RULE_CLIENT_ID,
        client_secret: configuration.PROVISIONING_RULE_CLIENT_SECRET,
        audience: audience
      }
    })
    .then(function (body) {
      return body.access_token;
    });
  }

  function fetchAccessTokens () {
    if (global.accessTokens) {
      console.log(LOG_PREFIX + 'Using cached access tokens');

      return Promise.resolve(global.accessTokens);
    }

    console.log(LOG_PREFIX + 'Fetching access tokens and loading them into cache');
    return Promise.props({
      managementApi: clientCredentials('https://' + auth0.domain + '/api/v2/'),
      authZ: clientCredentials('urn:auth0-authz-api')
    }).then(function (accessTokens) {
      // set cache
      global.accessTokens = accessTokens;

      return accessTokens;
    });
  }

  return fetchAccessTokens()
    .then(function (accessTokens) {
      // check to see if a user with the same email exists in the provisioned users connection
      return request.get({
        url: 'https://' + auth0.domain + '/api/v2/users',
        qs: {
          search_engine: 'v2',
          q: 'connection: "' + PROVISIONED_USERS_CONNECTION + '" AND email: "' + user.email + '"'
        },
        auth: { bearer: accessTokens.managementApi },
        json: true
      })
      .then(function (users) {  
        // bail if no matching users
        if (users.length === 0) {
          console.log(LOG_PREFIX + 'No matching provisioned user found.');
          return;
        }

        var provisionedUser = users[0];

        function deleteProvisionedUser () {
          console.log(LOG_PREFIX + 'Deleting provisioned user:', provisionedUser.user_id);

          return request.delete({
            url: 'https://' + auth0.domain + '/api/v2/users/' + provisionedUser.user_id,
            auth: { bearer: accessTokens.managementApi }
          });
        }

        // just delete the provisioned user if no membership data
        if (!provisionedUser.app_metadata || !provisionedUser.app_metadata.memberships) {
          console.log(LOG_PREFIX + 'Provisioned user had no memberships');

          return deleteProvisionedUser();
        }

        // fetch user's existing roles
        return request.get({
          url: configuration.AUTHZ_API_BASE_URL + '/users/' + user.user_id + '/roles',
          auth: { bearer: accessTokens.authZ },
          json: true
        })
        .then(function (existingRoles) {
          var existingRoleIds = existingRoles.map(function (role) {
            return role._id;
          });

          // delete existing roles if any
          if (existingRoleIds.length > 0) {
            console.log(LOG_PREFIX + 'Removing user ' + user.user_id + ' from existing roles:', existingRoleIds);

            return request.delete({
              url: configuration.AUTHZ_API_BASE_URL + '/users/' + user.user_id + '/roles',
              auth: { bearer: accessTokens.authZ },
              json: existingRoleIds
            });        
          }
        })
        // fetch all roles data, if not already cached
        .then(function () {
          if (global.rolesByName) {
            console.log(LOG_PREFIX + 'Using cached roles list');

            return global.rolesByName;
          }

          console.log(LOG_PREFIX + 'Fetching all roles and loading them into cache');
          return request.get({
            url: configuration.AUTHZ_API_BASE_URL + '/roles',
            auth: { bearer: accessTokens.authZ },
            json: true
          })
          .then(function (rolesData) {
            global.rolesByName = {};
            for (var i in rolesData.roles) {
              var role = rolesData.roles[i];
              global.rolesByName[role.name] = role;
            }

            return global.rolesByName;
          });      
        })
        // convert provisioned memberships (role names) into role IDs
        .then(function (rolesByName) {
          return provisionedUser.app_metadata.memberships.map(function (membership) {
            return rolesByName[membership]._id;
          });
        })
        // update user with new roles
        .then(function (newRoleIds) {
          console.log(LOG_PREFIX + 'Updating user ' + user.user_id + ' with new role IDs', newRoleIds);

          return request.patch({
            url: configuration.AUTHZ_API_BASE_URL + '/users/' + user.user_id + '/roles',
            auth: { bearer: accessTokens.authZ },
            json: newRoleIds
          });      
        })
        //finally delete provisioned user
        .then(deleteProvisionedUser);
      });
    })
    // success
    .then(function () {
      return callback(null, user, context);
    })
    // error
    .catch(function (err) {
      console.log(LOG_PREFIX + 'Error:', err);
      return callback(err);
    });
}
