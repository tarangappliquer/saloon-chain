# AdminCustomersApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminCustomersGet**](#apiadmincustomersget) | **GET** /api/admin/customers | |
|[**apiAdminCustomersIdBookingsGet**](#apiadmincustomersidbookingsget) | **GET** /api/admin/customers/{id}/bookings | |
|[**apiAdminCustomersIdDelete**](#apiadmincustomersiddelete) | **DELETE** /api/admin/customers/{id} | |
|[**apiAdminCustomersIdNotesGet**](#apiadmincustomersidnotesget) | **GET** /api/admin/customers/{id}/notes | |
|[**apiAdminCustomersIdNotesNoteIdDelete**](#apiadmincustomersidnotesnoteiddelete) | **DELETE** /api/admin/customers/{id}/notes/{noteId} | |
|[**apiAdminCustomersIdNotesPost**](#apiadmincustomersidnotespost) | **POST** /api/admin/customers/{id}/notes | |
|[**apiAdminCustomersIdProfileGet**](#apiadmincustomersidprofileget) | **GET** /api/admin/customers/{id}/profile | |
|[**apiAdminCustomersIdPut**](#apiadmincustomersidput) | **PUT** /api/admin/customers/{id} | |
|[**apiAdminCustomersIdTagsGet**](#apiadmincustomersidtagsget) | **GET** /api/admin/customers/{id}/tags | |
|[**apiAdminCustomersIdTagsPost**](#apiadmincustomersidtagspost) | **POST** /api/admin/customers/{id}/tags | |
|[**apiAdminCustomersIdTagsTagIdDelete**](#apiadmincustomersidtagstagiddelete) | **DELETE** /api/admin/customers/{id}/tags/{tagId} | |
|[**apiAdminCustomersPost**](#apiadmincustomerspost) | **POST** /api/admin/customers | |
|[**apiAdminCustomersSearchGet**](#apiadmincustomerssearchget) | **GET** /api/admin/customers/search | |

# **apiAdminCustomersGet**
> AdminCustomersPageDto apiAdminCustomersGet()

List customers, including inactive, for admin management -- keyset-paginated by Name/Id for infinite scroll.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let search: string; // (optional) (default to undefined)
let pageSize: number; // (optional) (default to undefined)
let cursorName: string; // (optional) (default to undefined)
let cursorId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersGet(
    search,
    pageSize,
    cursorName,
    cursorId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **search** | [**string**] |  | (optional) defaults to undefined|
| **pageSize** | [**number**] |  | (optional) defaults to undefined|
| **cursorName** | [**string**] |  | (optional) defaults to undefined|
| **cursorId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**AdminCustomersPageDto**

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

# **apiAdminCustomersIdBookingsGet**
> Array<MyBookingDto> apiAdminCustomersIdBookingsGet()

List a customer\'s visit history at the caller\'s chain/location scope.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdBookingsGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<MyBookingDto>**

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
|**400** | Bad Request |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCustomersIdDelete**
> apiAdminCustomersIdDelete()

Soft-delete a customer account.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdDelete(
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

# **apiAdminCustomersIdNotesGet**
> Array<CustomerNoteDto> apiAdminCustomersIdNotesGet()

List a customer\'s notes visible at the caller\'s chain/location scope.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdNotesGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<CustomerNoteDto>**

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

# **apiAdminCustomersIdNotesNoteIdDelete**
> apiAdminCustomersIdNotesNoteIdDelete()

Delete a customer note.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)
let noteId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdNotesNoteIdDelete(
    id,
    noteId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **noteId** | [**number**] |  | defaults to undefined|


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

# **apiAdminCustomersIdNotesPost**
> IdResponse apiAdminCustomersIdNotesPost(addCustomerNoteRequest)

Add a note to a customer\'s record, scoped to a location or saloon-wide.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration,
    AddCustomerNoteRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)
let addCustomerNoteRequest: AddCustomerNoteRequest; //

const { status, data } = await apiInstance.apiAdminCustomersIdNotesPost(
    id,
    addCustomerNoteRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **addCustomerNoteRequest** | **AddCustomerNoteRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|


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

# **apiAdminCustomersIdProfileGet**
> CustomerProfileDto apiAdminCustomersIdProfileGet()

Get a customer\'s profile detail for the client record page.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdProfileGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**CustomerProfileDto**

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
|**404** | Not Found |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCustomersIdPut**
> apiAdminCustomersIdPut(updateCustomerRequest)

Update a customer\'s name/phone/active state.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration,
    UpdateCustomerRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)
let updateCustomerRequest: UpdateCustomerRequest; //

const { status, data } = await apiInstance.apiAdminCustomersIdPut(
    id,
    updateCustomerRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateCustomerRequest** | **UpdateCustomerRequest**|  | |
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

# **apiAdminCustomersIdTagsGet**
> Array<CustomerTagDto> apiAdminCustomersIdTagsGet()

List a customer\'s tags visible at the caller\'s chain/location scope.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdTagsGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<CustomerTagDto>**

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

# **apiAdminCustomersIdTagsPost**
> IdResponse apiAdminCustomersIdTagsPost(addCustomerTagRequest)

Add a tag to a customer\'s record, scoped to a location or saloon-wide.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration,
    AddCustomerTagRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)
let addCustomerTagRequest: AddCustomerTagRequest; //

const { status, data } = await apiInstance.apiAdminCustomersIdTagsPost(
    id,
    addCustomerTagRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **addCustomerTagRequest** | **AddCustomerTagRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|


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

# **apiAdminCustomersIdTagsTagIdDelete**
> apiAdminCustomersIdTagsTagIdDelete()

Remove a tag from a customer\'s record.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let id: number; // (default to undefined)
let tagId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersIdTagsTagIdDelete(
    id,
    tagId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **tagId** | [**number**] |  | defaults to undefined|


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

# **apiAdminCustomersPost**
> IdResponse apiAdminCustomersPost(createCustomerRequest)

Create a new customer account or walk-in customer profile (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist).

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration,
    CreateCustomerRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let createCustomerRequest: CreateCustomerRequest; //

const { status, data } = await apiInstance.apiAdminCustomersPost(
    createCustomerRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createCustomerRequest** | **CreateCustomerRequest**|  | |


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

# **apiAdminCustomersSearchGet**
> Array<CustomerSummaryDto> apiAdminCustomersSearchGet()

Search customers by name/email for the emulation picker.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let q: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersSearchGet(
    q
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **q** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<CustomerSummaryDto>**

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

