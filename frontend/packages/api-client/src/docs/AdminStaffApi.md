# AdminStaffApi

All URIs are relative to *https://localhost:7185*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminStaffGet**](#apiadminstaffget) | **GET** /api/admin/staff | |
|[**apiAdminStaffIdPut**](#apiadminstaffidput) | **PUT** /api/admin/staff/{id} | |
|[**apiAdminStaffPost**](#apiadminstaffpost) | **POST** /api/admin/staff | |

# **apiAdminStaffGet**
> Array<StaffUserDto> apiAdminStaffGet()

List staff users, scoped to the caller\'s own chain/location where applicable.

### Example

```typescript
import {
    AdminStaffApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminStaffApi(configuration);

let role: string; // (optional) (default to undefined)
let chainId: ApiBookingStreamGetLocationIdParameter; // (optional) (default to undefined)
let locationId: ApiBookingStreamGetLocationIdParameter; // (optional) (default to undefined)

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
| **chainId** | [**ApiBookingStreamGetLocationIdParameter**] |  | (optional) defaults to undefined|
| **locationId** | [**ApiBookingStreamGetLocationIdParameter**] |  | (optional) defaults to undefined|


### Return type

**Array<StaffUserDto>**

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

# **apiAdminStaffIdPut**
> apiAdminStaffIdPut(updateStaffRequest)

Update a staff user\'s details, scope, or active/emulator state.

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

