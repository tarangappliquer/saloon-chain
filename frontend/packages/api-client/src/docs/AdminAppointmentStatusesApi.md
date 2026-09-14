# AdminAppointmentStatusesApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminAppointmentStatusesGet**](#apiadminappointmentstatusesget) | **GET** /api/admin/appointment-statuses | |
|[**apiAdminAppointmentStatusesIdDelete**](#apiadminappointmentstatusesiddelete) | **DELETE** /api/admin/appointment-statuses/{id} | |
|[**apiAdminAppointmentStatusesIdPut**](#apiadminappointmentstatusesidput) | **PUT** /api/admin/appointment-statuses/{id} | |
|[**apiAdminAppointmentStatusesPost**](#apiadminappointmentstatusespost) | **POST** /api/admin/appointment-statuses | |

# **apiAdminAppointmentStatusesGet**
> Array<AppointmentStatusDto> apiAdminAppointmentStatusesGet()

Get appointment progress statuses (saloon level, location level, and global defaults).

### Example

```typescript
import {
    AdminAppointmentStatusesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminAppointmentStatusesApi(configuration);

let chainId: number; // (optional) (default to undefined)
let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminAppointmentStatusesGet(
    chainId,
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**number**] |  | (optional) defaults to undefined|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<AppointmentStatusDto>**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminAppointmentStatusesIdDelete**
> apiAdminAppointmentStatusesIdDelete()

Delete (soft delete) a custom appointment status.

### Example

```typescript
import {
    AdminAppointmentStatusesApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminAppointmentStatusesApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminAppointmentStatusesIdDelete(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminAppointmentStatusesIdPut**
> apiAdminAppointmentStatusesIdPut(updateAppointmentStatusRequest)

Update an existing appointment status.

### Example

```typescript
import {
    AdminAppointmentStatusesApi,
    Configuration,
    UpdateAppointmentStatusRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminAppointmentStatusesApi(configuration);

let id: number; // (default to undefined)
let updateAppointmentStatusRequest: UpdateAppointmentStatusRequest; //

const { status, data } = await apiInstance.apiAdminAppointmentStatusesIdPut(
    id,
    updateAppointmentStatusRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateAppointmentStatusRequest** | **UpdateAppointmentStatusRequest**|  | |
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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminAppointmentStatusesPost**
> IdResponse apiAdminAppointmentStatusesPost(createAppointmentStatusRequest)

Create a custom appointment status at saloon level or location level.

### Example

```typescript
import {
    AdminAppointmentStatusesApi,
    Configuration,
    CreateAppointmentStatusRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminAppointmentStatusesApi(configuration);

let createAppointmentStatusRequest: CreateAppointmentStatusRequest; //

const { status, data } = await apiInstance.apiAdminAppointmentStatusesPost(
    createAppointmentStatusRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createAppointmentStatusRequest** | **CreateAppointmentStatusRequest**|  | |


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

