# AuthApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAuthEmailConfirmPost**](#apiauthemailconfirmpost) | **POST** /api/auth/email/confirm | |
|[**apiAuthEmulateCustomerIdPost**](#apiauthemulatecustomeridpost) | **POST** /api/auth/emulate/{customerId} | |
|[**apiAuthForgotPasswordPost**](#apiauthforgotpasswordpost) | **POST** /api/auth/forgot-password | |
|[**apiAuthLoginPost**](#apiauthloginpost) | **POST** /api/auth/login | |
|[**apiAuthLogoutPost**](#apiauthlogoutpost) | **POST** /api/auth/logout | |
|[**apiAuthMeGet**](#apiauthmeget) | **GET** /api/auth/me | |
|[**apiAuthRefreshPost**](#apiauthrefreshpost) | **POST** /api/auth/refresh | |
|[**apiAuthRegisterPost**](#apiauthregisterpost) | **POST** /api/auth/register | |
|[**apiAuthResetPasswordPost**](#apiauthresetpasswordpost) | **POST** /api/auth/reset-password | |

# **apiAuthEmailConfirmPost**
> apiAuthEmailConfirmPost(confirmEmailChangeRequest)

Confirm a pending email change using the token mailed to the new address.

### Example

```typescript
import {
    AuthApi,
    Configuration,
    ConfirmEmailChangeRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let confirmEmailChangeRequest: ConfirmEmailChangeRequest; //

const { status, data } = await apiInstance.apiAuthEmailConfirmPost(
    confirmEmailChangeRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **confirmEmailChangeRequest** | **ConfirmEmailChangeRequest**|  | |


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthEmulateCustomerIdPost**
> AuthResponse apiAuthEmulateCustomerIdPost()

Exchange the caller\'s staff session for a Customer session, acting on their behalf.

### Example

```typescript
import {
    AuthApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let customerId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAuthEmulateCustomerIdPost(
    customerId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **customerId** | [**number**] |  | defaults to undefined|


### Return type

**AuthResponse**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthForgotPasswordPost**
> apiAuthForgotPasswordPost(forgotPasswordRequest)

Request a password-reset email. Always succeeds, whether or not the email is registered.

### Example

```typescript
import {
    AuthApi,
    Configuration,
    ForgotPasswordRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let forgotPasswordRequest: ForgotPasswordRequest; //

const { status, data } = await apiInstance.apiAuthForgotPasswordPost(
    forgotPasswordRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **forgotPasswordRequest** | **ForgotPasswordRequest**|  | |


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthLoginPost**
> AuthResponse apiAuthLoginPost(loginRequest)

Log in with email/password, returning an access token and refresh token.

### Example

```typescript
import {
    AuthApi,
    Configuration,
    LoginRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let loginRequest: LoginRequest; //

const { status, data } = await apiInstance.apiAuthLoginPost(
    loginRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **loginRequest** | **LoginRequest**|  | |


### Return type

**AuthResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthLogoutPost**
> apiAuthLogoutPost(refreshRequest)

Revoke a refresh token on sign-out.

### Example

```typescript
import {
    AuthApi,
    Configuration,
    RefreshRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let refreshRequest: RefreshRequest; //

const { status, data } = await apiInstance.apiAuthLogoutPost(
    refreshRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **refreshRequest** | **RefreshRequest**|  | |


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthMeGet**
> AuthResponse apiAuthMeGet()

Get the caller\'s own profile and impersonation banner state.

### Example

```typescript
import {
    AuthApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

const { status, data } = await apiInstance.apiAuthMeGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**AuthResponse**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthRefreshPost**
> AuthResponse apiAuthRefreshPost(refreshRequest)

Exchange a refresh token for a new access/refresh pair (rotates the old one).

### Example

```typescript
import {
    AuthApi,
    Configuration,
    RefreshRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let refreshRequest: RefreshRequest; //

const { status, data } = await apiInstance.apiAuthRefreshPost(
    refreshRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **refreshRequest** | **RefreshRequest**|  | |


### Return type

**AuthResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthRegisterPost**
> AuthResponse apiAuthRegisterPost(registerRequest)

Self-register a new Customer account.

### Example

```typescript
import {
    AuthApi,
    Configuration,
    RegisterRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let registerRequest: RegisterRequest; //

const { status, data } = await apiInstance.apiAuthRegisterPost(
    registerRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **registerRequest** | **RegisterRequest**|  | |


### Return type

**AuthResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAuthResetPasswordPost**
> apiAuthResetPasswordPost(resetPasswordRequest)

Redeem a password-reset token to set a new password.

### Example

```typescript
import {
    AuthApi,
    Configuration,
    ResetPasswordRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AuthApi(configuration);

let resetPasswordRequest: ResetPasswordRequest; //

const { status, data } = await apiInstance.apiAuthResetPasswordPost(
    resetPasswordRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **resetPasswordRequest** | **ResetPasswordRequest**|  | |


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

