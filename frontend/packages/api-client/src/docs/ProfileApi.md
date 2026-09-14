# ProfileApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiProfileEmailChangeRequestPost**](#apiprofileemailchangerequestpost) | **POST** /api/profile/email/change-request | |
|[**apiProfileEmailVerifyRequestPost**](#apiprofileemailverifyrequestpost) | **POST** /api/profile/email/verify-request | |
|[**apiProfileGet**](#apiprofileget) | **GET** /api/profile | |
|[**apiProfilePut**](#apiprofileput) | **PUT** /api/profile | |
|[**apiProfileStreamGet**](#apiprofilestreamget) | **GET** /api/profile/stream | |

# **apiProfileEmailChangeRequestPost**
> apiProfileEmailChangeRequestPost(changeEmailRequest)

Request an email change -- mails a confirmation link to the new address; the email isn\'t changed until confirmed.

### Example

```typescript
import {
    ProfileApi,
    Configuration,
    ChangeEmailRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new ProfileApi(configuration);

let changeEmailRequest: ChangeEmailRequest; //

const { status, data } = await apiInstance.apiProfileEmailChangeRequestPost(
    changeEmailRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **changeEmailRequest** | **ChangeEmailRequest**|  | |


### Return type

void (empty response body)

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**400** | Bad Request |  -  |
|**403** | Forbidden |  -  |
|**409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiProfileEmailVerifyRequestPost**
> apiProfileEmailVerifyRequestPost()

Request a verification email for the caller\'s current (unverified) address.

### Example

```typescript
import {
    ProfileApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ProfileApi(configuration);

const { status, data } = await apiInstance.apiProfileEmailVerifyRequestPost();
```

### Parameters
This endpoint does not have any parameters.


### Return type

void (empty response body)

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiProfileGet**
> ProfileResponse apiProfileGet()

Get the caller\'s own profile.

### Example

```typescript
import {
    ProfileApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ProfileApi(configuration);

const { status, data } = await apiInstance.apiProfileGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**ProfileResponse**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**200** | OK |  -  |
|**404** | Not Found |  -  |
|**400** | Bad Request |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiProfilePut**
> ProfileResponse apiProfilePut(updateProfileRequest)

Update the caller\'s own name/phone.

### Example

```typescript
import {
    ProfileApi,
    Configuration,
    UpdateProfileRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new ProfileApi(configuration);

let updateProfileRequest: UpdateProfileRequest; //

const { status, data } = await apiInstance.apiProfilePut(
    updateProfileRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateProfileRequest** | **UpdateProfileRequest**|  | |


### Return type

**ProfileResponse**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**400** | Bad Request |  -  |
|**200** | OK |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiProfileStreamGet**
> apiProfileStreamGet()

Server-sent events stream: notifies when the given user\'s email has been verified.

### Example

```typescript
import {
    ProfileApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ProfileApi(configuration);

let userId: number; // (default to undefined)

const { status, data } = await apiInstance.apiProfileStreamGet(
    userId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **userId** | [**number**] |  | defaults to undefined|


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

