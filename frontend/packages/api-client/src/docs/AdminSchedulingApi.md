# AdminSchedulingApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminSchedulingBlockTypesGet**](#apiadminschedulingblocktypesget) | **GET** /api/admin/scheduling/block-types | |
|[**apiAdminSchedulingBlockTypesIdDelete**](#apiadminschedulingblocktypesiddelete) | **DELETE** /api/admin/scheduling/block-types/{id} | |
|[**apiAdminSchedulingBlockTypesIdPut**](#apiadminschedulingblocktypesidput) | **PUT** /api/admin/scheduling/block-types/{id} | |
|[**apiAdminSchedulingBlockTypesPost**](#apiadminschedulingblocktypespost) | **POST** /api/admin/scheduling/block-types | |

# **apiAdminSchedulingBlockTypesGet**
> Array<BlockTypeDto> apiAdminSchedulingBlockTypesGet()

Get block types (saloon level, location level, and global defaults).

### Example

```typescript
import {
    AdminSchedulingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminSchedulingApi(configuration);

let chainId: number; // (optional) (default to undefined)
let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingBlockTypesGet(
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

**Array<BlockTypeDto>**

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

# **apiAdminSchedulingBlockTypesIdDelete**
> apiAdminSchedulingBlockTypesIdDelete()

Delete (soft delete) a custom block type.

### Example

```typescript
import {
    AdminSchedulingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminSchedulingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingBlockTypesIdDelete(
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

# **apiAdminSchedulingBlockTypesIdPut**
> apiAdminSchedulingBlockTypesIdPut(updateBlockTypeRequest)

Update an existing block type.

### Example

```typescript
import {
    AdminSchedulingApi,
    Configuration,
    UpdateBlockTypeRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminSchedulingApi(configuration);

let id: number; // (default to undefined)
let updateBlockTypeRequest: UpdateBlockTypeRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingBlockTypesIdPut(
    id,
    updateBlockTypeRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateBlockTypeRequest** | **UpdateBlockTypeRequest**|  | |
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

# **apiAdminSchedulingBlockTypesPost**
> IdResponse apiAdminSchedulingBlockTypesPost(createBlockTypeRequest)

Create a custom block type at saloon level or location level.

### Example

```typescript
import {
    AdminSchedulingApi,
    Configuration,
    CreateBlockTypeRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminSchedulingApi(configuration);

let createBlockTypeRequest: CreateBlockTypeRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingBlockTypesPost(
    createBlockTypeRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createBlockTypeRequest** | **CreateBlockTypeRequest**|  | |


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

