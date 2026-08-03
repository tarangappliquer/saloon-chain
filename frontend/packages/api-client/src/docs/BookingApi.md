# BookingApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiBookingAvailableDatesGet**](#apibookingavailabledatesget) | **GET** /api/booking/available-dates | |
|[**apiBookingAvailableSlotsGet**](#apibookingavailableslotsget) | **GET** /api/booking/available-slots | |
|[**apiBookingHoldPost**](#apibookingholdpost) | **POST** /api/booking/hold | |
|[**apiBookingIdConfirmPost**](#apibookingidconfirmpost) | **POST** /api/booking/{id}/confirm | |
|[**apiBookingIdDelete**](#apibookingiddelete) | **DELETE** /api/booking/{id} | |
|[**apiBookingMineGet**](#apibookingmineget) | **GET** /api/booking/mine | |
|[**apiBookingStreamGet**](#apibookingstreamget) | **GET** /api/booking/stream | |

# **apiBookingAvailableDatesGet**
> Array<string> apiBookingAvailableDatesGet()

List dates in range that have at least one open slot at a location.

### Example

```typescript
import {
    BookingApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)
let from: string; // (default to undefined)
let to: string; // (default to undefined)

const { status, data } = await apiInstance.apiBookingAvailableDatesGet(
    locationId,
    from,
    to
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|
| **from** | [**string**] |  | defaults to undefined|
| **to** | [**string**] |  | defaults to undefined|


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
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)
let treatmentIds: string; // (default to undefined)
let date: string; // (default to undefined)

const { status, data } = await apiInstance.apiBookingAvailableSlotsGet(
    locationId,
    treatmentIds,
    date
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|
| **treatmentIds** | [**string**] |  | defaults to undefined|
| **date** | [**string**] |  | defaults to undefined|


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

# **apiBookingHoldPost**
> HoldResponse apiBookingHoldPost(holdRequest)

Temporarily hold a slot while the customer completes checkout.

### Example

```typescript
import {
    BookingApi,
    Configuration,
    HoldRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let holdRequest: HoldRequest; //

const { status, data } = await apiInstance.apiBookingHoldPost(
    holdRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **holdRequest** | **HoldRequest**|  | |


### Return type

**HoldResponse**

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

Confirm a held booking before it expires.

### Example

```typescript
import {
    BookingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiBookingIdConfirmPost(
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
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new BookingApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)
let date: string; // (default to undefined)

const { status, data } = await apiInstance.apiBookingStreamGet(
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

