# Delegated Administration Dashboard Extension using the Authorization Extension

Many Auth0 customers use the [Authorization Extension](https://auth0.com/docs/extensions/authorization-extension/v2) to manage access to their applications using groups, roles, and permissions. Typically they also need to provide a group of administrators the ability to manage their users, granting those users the access levels defined in the **Authorization Extension**. 

The [Delegated Administration Dashboard Extension](https://auth0.com/docs/extensions/delegated-admin) can be used to provide a simple UI that delegated administrators can use to manage their users, performing tasks such as creating new accounts, password changes, and MFA resets. With some customization, it can be also configured to use the roles defined in the **Authorization Extensions**, specifically when new users are provisioned. 

## This sample shows how you can

* Configure the **Delegated Administration Dashboard Extension** to use roles from the **Authorization Extension** as a source for memberships when creating users.

* Provision users in federated connections (eg. Active Directory, ADFS, Facebook) with those roles _before_ they authenticate for the first time. This is done using a Database connection that can contain temporary "provisioned" users. Then when the user finally signs in using the federated connection, their membership configuration is migrated using an Auth0 [rule](https://auth0.com/docs/rules/current) and the "provisioned" user is deleted from the Database connection.

* Perform the above, but where no federated connection is required, so the user is provisioned in-place in the same connection.

## Setup

1. In the [Auth0 Dashboard](https://manage.auth0.com), install both the [Authorization](https://auth0.com/docs/extensions/authorization-extension/v2) and [Delegated Administration Dashboard](https://auth0.com/docs/extensions/delegated-admin) extensions.
1. [Enable API access](https://auth0.com/docs/extensions/authorization-extension/v2#enable-api-access) in the **Authorization Extension**
1. Create a new **Non-Interactive** [client](https://manage.auth0.com/#/clients) called `provisioningRule` that will be used by a rule (see later step) to make API calls to both the [Auth0 Management API](https://auth0.com/docs/api/v2) and the **Authorization Extension API**.
1. [Create a client credentials grant](https://auth0.com/docs/api-auth/config/using-the-auth0-dashboard) for the `provisioningRule` client so it has access to the **Auth0 Management API** with the following scopes:
   * `read:users`
   * `update:users`
   * `delete:users`
1. Create another client credentials grant for the `provisioningRule` client so it has access to the **Authorization Extension API** (`auth0-authorization-extension-api`) with the following scopes:
   * `read:roles`
   * `update:roles`
   * `delete:roles`
1. Create a [new rule](https://manage.auth0.com/#/rules/new) with the name `provisioningRule` populated with code from the [`rules/provisioningRule.js`](rules/provisioningRule.js) file, changing the values of the following variables:
   * `FEDERATED_CONNECTIONS`: The names of all the federated connections that will participate in provisioning
   * `FEDERATED_PROVISIONED_USERS_CONNECTION`: The name of the Database connection that will contain temporary users used for provisioning into the `FEDERATED_CONNECTIONS`
   * `IN_PLACE_PROVISIONING_CONNECTIONS`: The names of all the Database connections where in-place provisioning will take place
1. Add the following **Settings** in the [Rules](https://manage.auth0.com/#/rules) page:
   * `PROVISIONING_RULE_CLIENT_ID`: The Client ID of the `provisioningRule` client created above
   * `PROVISIONING_RULE_CLIENT_SECRET`: The Client Secret of the `provisioningRule` client created above
   * `AUTHZ_API_BASE_URL`: The base URL of the Authorization Extension API, which can be found in the [API section](https://auth0.com/docs/extensions/authorization-extension/v2#enable-api-access) of the extension
1. Create a new **Non-Interactive** [client](https://manage.auth0.com/#/clients) called `membershipHook` that will be used by the Memberships Query Hook in the **Delegated Administration Dashboard** extension (see later step) to make API calls to the **Authorization Extension API**.
1. [Create a client credentials grant](https://auth0.com/docs/api-auth/config/using-the-auth0-dashboard) for the `membershipHook` client so it has access to the **Authorization Extension API** (`auth0-authorization-extension-api`) with the following scopes:
   * `read:roles`
1. In the **Delegated Administration Dashboard** extension, populate the [Memberships Query Hook](https://auth0.com/docs/extensions/delegated-admin/hooks#the-memberships-query-hook) with code in the [`delegated-admin-extension/membershipsHook.js`](delegated-admin-extension/membershipsHook.js) file, changing the values of the following variables:
   * `AUTH0_DOMAIN`: The full name of your Auth0 tenant domain
   * `MEMBERSHIPS_HOOK_CLIENT_ID`: The Client ID of the `membershipHook` client created above
   * `MEMBERSHIPS_HOOK_CLIENT_SECRET`: The Client Secret of the `membershipHook` client created above
   * `AUTHZ_API_BASE_URL`: The base URL of the Authorization Extension API, which can be found in the [API section](https://auth0.com/docs/extensions/authorization-extension/v2#enable-api-access) of the extension

---

## What is Auth0?

Auth0 helps you to:

* Add authentication with [multiple authentication sources](https://docs.auth0.com/identityproviders), either social like **Google, Facebook, Microsoft Account, LinkedIn, GitHub, Twitter, Box, Salesforce, amongst others**, or enterprise identity systems like **Windows Azure AD, Google Apps, Active Directory, ADFS or any SAML Identity Provider**.
* Add authentication through more traditional **[username/password databases](https://docs.auth0.com/mysql-connection-tutorial)**.
* Add support for **[linking different user accounts](https://docs.auth0.com/link-accounts)** with the same user.
* Support for generating signed [Json Web Tokens](https://docs.auth0.com/jwt) to call your APIs and **flow the user identity** securely.
* Analytics of how, when and where users are logging in.
* Pull data from other sources and add it to the user profile, through [JavaScript rules](https://docs.auth0.com/rules).

## Create a free account in Auth0

1. Go to [Auth0](https://auth0.com) and click Sign Up.
2. Use Google, GitHub or Microsoft Account to login.

## Issue Reporting

If you have found a bug or if you have a feature request, please report them at this repository issues section. Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/whitehat) details the procedure for disclosing security issues.

## Author

[Auth0](auth0.com)

## License

This project is licensed under the MIT license. See the [LICENSE](LICENSE.txt) file for more info.
