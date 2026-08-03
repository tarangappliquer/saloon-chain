# AdminBookingsApi

All URIs are relative to *https://localhost:7185*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminBookingsGet**](#apiadminbookingsget) | **GET** /api/admin/bookings | |
|[**apiAdminBookingsIdCancelPost**](#apiadminbookingsidcancelpost) | **POST** /api/admin/bookings/{id}/cancel | |

# **apiAdminBookingsGet**
> Array<AdminBookingDto> apiAdminBookingsGet()

List a location\'s bookings for a given date.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)
let date: string; // (default to undefined)

const { status, data } = await apiInstance.apiAdminBookingsGet(
    locationId,
    date
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|
| **date** | [**string**] |  | defaults to undefined|


### Return type

**Array<AdminBookingDto>**

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

# **apiAdminBookingsIdCancelPost**
> apiAdminBookingsIdCancelPost()

Cancel a customer\'s booking on their behalf and free its slot.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminBookingsIdCancelPost(
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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

