# BookingApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiBookingAvailableDatesGet**](#apibookingavailabledatesget) | **GET** /api/booking/available-dates | |
|[**apiBookingAvailableSlotsGet**](#apibookingavailableslotsget) | **GET** /api/booking/available-slots | |
|[**apiBookingDraftPost**](#apibookingdraftpost) | **POST** /api/booking/draft | |
|[**apiBookingIdConfirmPost**](#apibookingidconfirmpost) | **POST** /api/booking/{id}/confirm | |
|[**apiBookingIdDelete**](#apibookingiddelete) | **DELETE** /api/booking/{id} | |
|[**apiBookingIdGet**](#apibookingidget) | **GET** /api/booking/{id} | |
|[**apiBookingIdTreatmentsPost**](#apibookingidtreatmentspost) | **POST** /api/booking/{id}/treatments | |
|[**apiBookingIdTreatmentsTreatmentIdDelete**](#apibookingidtreatmentstreatmentiddelete) | **DELETE** /api/booking/{id}/treatments/{treatmentId} | |
|[**apiBookingIdTreatmentsTreatmentIdSchedulePut**](#apibookingidtreatmentstreatmentidscheduleput) | **PUT** /api/booking/{id}/treatments/{treatmentId}/schedule | |
|[**apiBookingMineGet**](#apibookingmineget) | **GET** /api/booking/mine | |
|[**apiBookingStreamGet**](#apibookingstreamget) | **GET** /api/booking/stream | |

# **apiBookingAvailableDatesGet**
> Array<string> apiBookingAvailableDatesGet()

List dates in range that have at least one open slot for all requested treatments at a location.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let locationId: number; // (optional) (default to undefined)
let from: string; // (optional) (default to undefined)
let to: string; // (optional) (default to undefined)
let treatmentIds: string; // (optional) (default to undefined)
let excludeBookingId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiBookingAvailableDatesGet(
    locationId,
    from,
    to,
    treatmentIds,
    excludeBookingId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|
| **from** | [**string**] |  | (optional) defaults to undefined|
| **to** | [**string**] |  | (optional) defaults to undefined|
| **treatmentIds** | [**string**] |  | (optional) defaults to undefined|
| **excludeBookingId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<string>**

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

# **apiBookingAvailableSlotsGet**
> Array<AvailableSlot> apiBookingAvailableSlotsGet()

List open time slots for a treatment combo at a location/date.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let locationId: number; // (optional) (default to undefined)
let treatmentIds: string; // (optional) (default to undefined)
let date: string; // (optional) (default to undefined)
let excludeBookingId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiBookingAvailableSlotsGet(
    locationId,
    treatmentIds,
    date,
    excludeBookingId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|
| **treatmentIds** | [**string**] |  | (optional) defaults to undefined|
| **date** | [**string**] |  | (optional) defaults to undefined|
| **excludeBookingId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<AvailableSlot>**

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

# **apiBookingDraftPost**
> DraftResponse apiBookingDraftPost(draftRequest)

Start a draft booking for one or more treatments, before any time is picked.

### Example

```typescript
import {
    BookingApi,
    Configuration,
    DraftRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let draftRequest: DraftRequest; //

const { status, data } = await apiInstance.apiBookingDraftPost(
    draftRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **draftRequest** | **DraftRequest**|  | |


### Return type

**DraftResponse**

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

# **apiBookingIdConfirmPost**
> apiBookingIdConfirmPost()

Confirm every scheduled treatment on a draft booking before its holds expire.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)
let customerId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiBookingIdConfirmPost(
    id,
    customerId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **customerId** | [**number**] |  | (optional) defaults to undefined|


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

# **apiBookingIdDelete**
> apiBookingIdDelete()

Cancel the caller\'s own booking.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiBookingIdDelete(
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

# **apiBookingIdGet**
> BookingDetailsDto apiBookingIdGet()

Fetch a draft/booking\'s current state -- powers refresh-restore from the booking id in the URL.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiBookingIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**BookingDetailsDto**

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

# **apiBookingIdTreatmentsPost**
> apiBookingIdTreatmentsPost(addTreatmentRequest)

Add another treatment to a draft booking.

### Example

```typescript
import {
    BookingApi,
    Configuration,
    AddTreatmentRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)
let addTreatmentRequest: AddTreatmentRequest; //

const { status, data } = await apiInstance.apiBookingIdTreatmentsPost(
    id,
    addTreatmentRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **addTreatmentRequest** | **AddTreatmentRequest**|  | |
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

# **apiBookingIdTreatmentsTreatmentIdDelete**
> apiBookingIdTreatmentsTreatmentIdDelete()

Remove a treatment from a draft booking, freeing its slot if it had one.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)
let treatmentId: number; // (default to undefined)

const { status, data } = await apiInstance.apiBookingIdTreatmentsTreatmentIdDelete(
    id,
    treatmentId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **treatmentId** | [**number**] |  | defaults to undefined|


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

# **apiBookingIdTreatmentsTreatmentIdSchedulePut**
> ScheduleResponse apiBookingIdTreatmentsTreatmentIdSchedulePut(scheduleRequest)

Claim a specific room/therapist/time slot for one treatment on a draft booking.

### Example

```typescript
import {
    BookingApi,
    Configuration,
    ScheduleRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)
let treatmentId: number; // (default to undefined)
let scheduleRequest: ScheduleRequest; //

const { status, data } = await apiInstance.apiBookingIdTreatmentsTreatmentIdSchedulePut(
    id,
    treatmentId,
    scheduleRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **scheduleRequest** | **ScheduleRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|
| **treatmentId** | [**number**] |  | defaults to undefined|


### Return type

**ScheduleResponse**

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

# **apiBookingMineGet**
> Array<MyBookingDto> apiBookingMineGet()

List the caller\'s own bookings.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

const { status, data } = await apiInstance.apiBookingMineGet();
```

### Parameters
This endpoint does not have any parameters.


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

# **apiBookingStreamGet**
> apiBookingStreamGet()

Server-sent events stream: notifies subscribers when a location/date\'s slots change.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let locationId: number; // (default to undefined)
let date: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiBookingStreamGet(
    locationId,
    date
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | defaults to undefined|
| **date** | [**string**] |  | (optional) defaults to undefined|


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

