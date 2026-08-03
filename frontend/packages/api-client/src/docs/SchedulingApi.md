# SchedulingApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminSchedulingRoomOpeningsIdDelete**](#apiadminschedulingroomopeningsiddelete) | **DELETE** /api/admin/scheduling/room-openings/{id} | |
|[**apiAdminSchedulingRoomOpeningsPost**](#apiadminschedulingroomopeningspost) | **POST** /api/admin/scheduling/room-openings | |
|[**apiAdminSchedulingRosterGet**](#apiadminschedulingrosterget) | **GET** /api/admin/scheduling/roster | |
|[**apiAdminSchedulingTherapistShiftsIdDelete**](#apiadminschedulingtherapistshiftsiddelete) | **DELETE** /api/admin/scheduling/therapist-shifts/{id} | |
|[**apiAdminSchedulingTherapistShiftsPost**](#apiadminschedulingtherapistshiftspost) | **POST** /api/admin/scheduling/therapist-shifts | |

# **apiAdminSchedulingRoomOpeningsIdDelete**
> apiAdminSchedulingRoomOpeningsIdDelete()

Close a room opening.

### Example

```typescript
import {
    SchedulingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingRoomOpeningsIdDelete(
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

# **apiAdminSchedulingRoomOpeningsPost**
> IdResponse apiAdminSchedulingRoomOpeningsPost(openRoomRequest)

Open a room for a treatment category during a shift/date.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    OpenRoomRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let openRoomRequest: OpenRoomRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingRoomOpeningsPost(
    openRoomRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **openRoomRequest** | **OpenRoomRequest**|  | |


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

# **apiAdminSchedulingRosterGet**
> RosterDto apiAdminSchedulingRosterGet()

Get a location\'s therapist shifts and room openings for a date.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)
let date: string; // (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingRosterGet(
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

**RosterDto**

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

# **apiAdminSchedulingTherapistShiftsIdDelete**
> apiAdminSchedulingTherapistShiftsIdDelete()

Remove a therapist\'s shift assignment.

### Example

```typescript
import {
    SchedulingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingTherapistShiftsIdDelete(
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

# **apiAdminSchedulingTherapistShiftsPost**
> IdResponse apiAdminSchedulingTherapistShiftsPost(assignTherapistShiftRequest)

Assign a therapist to a shift at a location/date.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    AssignTherapistShiftRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let assignTherapistShiftRequest: AssignTherapistShiftRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingTherapistShiftsPost(
    assignTherapistShiftRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **assignTherapistShiftRequest** | **AssignTherapistShiftRequest**|  | |


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

