# AdminBookingsApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminBookingsGet**](#apiadminbookingsget) | **GET** /api/admin/bookings | |
|[**apiAdminBookingsIdCancelPost**](#apiadminbookingsidcancelpost) | **POST** /api/admin/bookings/{id}/cancel | |
|[**apiAdminBookingsIdNoShowPost**](#apiadminbookingsidnoshowpost) | **POST** /api/admin/bookings/{id}/no-show | |
|[**apiAdminBookingsIdProductsGet**](#apiadminbookingsidproductsget) | **GET** /api/admin/bookings/{id}/products | |
|[**apiAdminBookingsIdProductsPost**](#apiadminbookingsidproductspost) | **POST** /api/admin/bookings/{id}/products | |
|[**apiAdminBookingsIdProductsProductLineIdDelete**](#apiadminbookingsidproductsproductlineiddelete) | **DELETE** /api/admin/bookings/{id}/products/{productLineId} | |
|[**apiAdminBookingsIdStatusPut**](#apiadminbookingsidstatusput) | **PUT** /api/admin/bookings/{id}/status | |
|[**apiAdminBookingsIdTreatmentsTreatmentIdReassignTherapistPost**](#apiadminbookingsidtreatmentstreatmentidreassigntherapistpost) | **POST** /api/admin/bookings/{id}/treatments/{treatmentId}/reassign-therapist | |
|[**apiAdminBookingsIdTreatmentsTreatmentIdReschedulePut**](#apiadminbookingsidtreatmentstreatmentidrescheduleput) | **PUT** /api/admin/bookings/{id}/treatments/{treatmentId}/reschedule | |

# **apiAdminBookingsGet**
> Array<AdminBookingDto> apiAdminBookingsGet()

List a location\'s bookings for a given date.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let locationId: number; // (default to undefined)
let date: string; // (default to undefined)

const { status, data } = await apiInstance.apiAdminBookingsGet(
    locationId,
    date
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | defaults to undefined|
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
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminBookingsIdCancelPost**
> apiAdminBookingsIdCancelPost()

Cancel a customer\'s booking on their behalf, process refund, send email and free its slot.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration,
    CancelBookingRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)
let cancelBookingRequest: CancelBookingRequest; // (optional)

const { status, data } = await apiInstance.apiAdminBookingsIdCancelPost(
    id,
    cancelBookingRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **cancelBookingRequest** | **CancelBookingRequest**|  | |
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

# **apiAdminBookingsIdNoShowPost**
> apiAdminBookingsIdNoShowPost()

Mark a Confirmed booking (past its start time) as a no-show.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminBookingsIdNoShowPost(
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
|**403** | Forbidden |  -  |
|**204** | No Content |  -  |
|**409** | Conflict |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminBookingsIdProductsGet**
> Array<BookingProductDto> apiAdminBookingsIdProductsGet()

List a booking\'s retail product lines.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminBookingsIdProductsGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<BookingProductDto>**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminBookingsIdProductsPost**
> IdResponse apiAdminBookingsIdProductsPost(addBookingProductRequest)

Add a retail product line to a Draft booking, priced at the product\'s current price.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration,
    AddBookingProductRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)
let addBookingProductRequest: AddBookingProductRequest; //

const { status, data } = await apiInstance.apiAdminBookingsIdProductsPost(
    id,
    addBookingProductRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **addBookingProductRequest** | **AddBookingProductRequest**|  | |
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
|**409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminBookingsIdProductsProductLineIdDelete**
> apiAdminBookingsIdProductsProductLineIdDelete()

Remove a retail product line from a booking.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)
let productLineId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminBookingsIdProductsProductLineIdDelete(
    id,
    productLineId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **productLineId** | [**number**] |  | defaults to undefined|


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

# **apiAdminBookingsIdStatusPut**
> apiAdminBookingsIdStatusPut(setAppointmentStatusRequest)

Set (or clear, with null) a Confirmed booking\'s saloon-defined progress status.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration,
    SetAppointmentStatusRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)
let setAppointmentStatusRequest: SetAppointmentStatusRequest; //

const { status, data } = await apiInstance.apiAdminBookingsIdStatusPut(
    id,
    setAppointmentStatusRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **setAppointmentStatusRequest** | **SetAppointmentStatusRequest**|  | |
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
|**204** | No Content |  -  |
|**409** | Conflict |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminBookingsIdTreatmentsTreatmentIdReassignTherapistPost**
> apiAdminBookingsIdTreatmentsTreatmentIdReassignTherapistPost(reassignTherapistRequest)

Assign proxy / alternate therapist for a treatment line when original therapist is away.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration,
    ReassignTherapistRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)
let treatmentId: number; // (default to undefined)
let reassignTherapistRequest: ReassignTherapistRequest; //

const { status, data } = await apiInstance.apiAdminBookingsIdTreatmentsTreatmentIdReassignTherapistPost(
    id,
    treatmentId,
    reassignTherapistRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **reassignTherapistRequest** | **ReassignTherapistRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|
| **treatmentId** | [**number**] |  | defaults to undefined|


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
|**204** | No Content |  -  |
|**409** | Conflict |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminBookingsIdTreatmentsTreatmentIdReschedulePut**
> apiAdminBookingsIdTreatmentsTreatmentIdReschedulePut(rescheduleTreatmentRequest)

Move a Confirmed booking\'s treatment to a new room/therapist/time.

### Example

```typescript
import {
    AdminBookingsApi,
    Configuration,
    RescheduleTreatmentRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminBookingsApi(configuration);

let id: number; // (default to undefined)
let treatmentId: number; // (default to undefined)
let rescheduleTreatmentRequest: RescheduleTreatmentRequest; //

const { status, data } = await apiInstance.apiAdminBookingsIdTreatmentsTreatmentIdReschedulePut(
    id,
    treatmentId,
    rescheduleTreatmentRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **rescheduleTreatmentRequest** | **RescheduleTreatmentRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|
| **treatmentId** | [**number**] |  | defaults to undefined|


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
|**204** | No Content |  -  |
|**409** | Conflict |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

