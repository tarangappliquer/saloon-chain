# AdminStaffApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminStaffAssignProxyPost**](#apiadminstaffassignproxypost) | **POST** /api/admin/staff/assign-proxy | |
|[**apiAdminStaffAttendanceGet**](#apiadminstaffattendanceget) | **GET** /api/admin/staff/attendance | |
|[**apiAdminStaffAttendancePost**](#apiadminstaffattendancepost) | **POST** /api/admin/staff/attendance | |
|[**apiAdminStaffGet**](#apiadminstaffget) | **GET** /api/admin/staff | |
|[**apiAdminStaffIdPut**](#apiadminstaffidput) | **PUT** /api/admin/staff/{id} | |
|[**apiAdminStaffPost**](#apiadminstaffpost) | **POST** /api/admin/staff | |

# **apiAdminStaffAssignProxyPost**
> ProxyAssignmentResultDto apiAdminStaffAssignProxyPost(assignProxyRequest)

Assign a proxy staff member to a booking line and notify location managers via email.

### Example

```typescript
import {
    AdminStaffApi,
    Configuration,
    AssignProxyRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let assignProxyRequest: AssignProxyRequest; //

const { status, data } = await apiInstance.apiAdminStaffAssignProxyPost(
    assignProxyRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **assignProxyRequest** | **AssignProxyRequest**|  | |


### Return type

**ProxyAssignmentResultDto**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminStaffAttendanceGet**
> Array<StaffAttendanceDto> apiAdminStaffAttendanceGet()

Get daily staff attendance roster for a location.

### Example

```typescript
import {
    AdminStaffApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let locationId: number; // (optional) (default to undefined)
let date: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminStaffAttendanceGet(
    locationId,
    date
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|
| **date** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<StaffAttendanceDto>**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminStaffAttendancePost**
> apiAdminStaffAttendancePost(logStaffAttendanceRequest)

Log arrival or departure/left time for a staff member (immutable once set).

### Example

```typescript
import {
    AdminStaffApi,
    Configuration,
    LogStaffAttendanceRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let logStaffAttendanceRequest: LogStaffAttendanceRequest; //

const { status, data } = await apiInstance.apiAdminStaffAttendancePost(
    logStaffAttendanceRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **logStaffAttendanceRequest** | **LogStaffAttendanceRequest**|  | |


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
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminStaffGet**
> Array<StaffUserDto> apiAdminStaffGet()

List staff users, scoped to the caller\'s own chain/location where applicable.

### Example

```typescript
import {
    AdminStaffApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let role: string; // (optional) (default to undefined)
let chainId: number; // (optional) (default to undefined)
let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminStaffGet(
    role,
    chainId,
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **role** | [**string**] |  | (optional) defaults to undefined|
| **chainId** | [**number**] |  | (optional) defaults to undefined|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<StaffUserDto>**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminStaffIdPut**
> apiAdminStaffIdPut(updateStaffRequest)

Update a staff user\'s details, role, scope, or active/emulator state.

### Example

```typescript
import {
    AdminStaffApi,
    Configuration,
    UpdateStaffRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let id: number; // (default to undefined)
let updateStaffRequest: UpdateStaffRequest; //

const { status, data } = await apiInstance.apiAdminStaffIdPut(
    id,
    updateStaffRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateStaffRequest** | **UpdateStaffRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|


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
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |
|**204** | No Content |  -  |
|**404** | Not Found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminStaffPost**
> IdResponse apiAdminStaffPost(createStaffRequest)

Create a new staff login, restricted to roles the caller is allowed to create.

### Example

```typescript
import {
    AdminStaffApi,
    Configuration,
    CreateStaffRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let createStaffRequest: CreateStaffRequest; //

const { status, data } = await apiInstance.apiAdminStaffPost(
    createStaffRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createStaffRequest** | **CreateStaffRequest**|  | |


### Return type

**IdResponse**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

