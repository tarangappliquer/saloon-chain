# SchedulingApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminSchedulingBlockedSlotsIdDelete**](#apiadminschedulingblockedslotsiddelete) | **DELETE** /api/admin/scheduling/blocked-slots/{id} | |
|[**apiAdminSchedulingBlockedSlotsIdPut**](#apiadminschedulingblockedslotsidput) | **PUT** /api/admin/scheduling/blocked-slots/{id} | |
|[**apiAdminSchedulingBlockedSlotsLocationPost**](#apiadminschedulingblockedslotslocationpost) | **POST** /api/admin/scheduling/blocked-slots/location | |
|[**apiAdminSchedulingBlockedSlotsPost**](#apiadminschedulingblockedslotspost) | **POST** /api/admin/scheduling/blocked-slots | |
|[**apiAdminSchedulingRoomOpeningsIdDelete**](#apiadminschedulingroomopeningsiddelete) | **DELETE** /api/admin/scheduling/room-openings/{id} | |
|[**apiAdminSchedulingRoomOpeningsPost**](#apiadminschedulingroomopeningspost) | **POST** /api/admin/scheduling/room-openings | |
|[**apiAdminSchedulingRosterGet**](#apiadminschedulingrosterget) | **GET** /api/admin/scheduling/roster | |
|[**apiAdminSchedulingTherapistShiftsIdDelete**](#apiadminschedulingtherapistshiftsiddelete) | **DELETE** /api/admin/scheduling/therapist-shifts/{id} | |
|[**apiAdminSchedulingTherapistShiftsIdPut**](#apiadminschedulingtherapistshiftsidput) | **PUT** /api/admin/scheduling/therapist-shifts/{id} | |
|[**apiAdminSchedulingTherapistShiftsPost**](#apiadminschedulingtherapistshiftspost) | **POST** /api/admin/scheduling/therapist-shifts | |

# **apiAdminSchedulingBlockedSlotsIdDelete**
> apiAdminSchedulingBlockedSlotsIdDelete()

Unblock a previously blocked room/time slot.

### Example

```typescript
import {
    SchedulingApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingBlockedSlotsIdDelete(
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
|**400** | Bad Request |  -  |
|**204** | No Content |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminSchedulingBlockedSlotsIdPut**
> apiAdminSchedulingBlockedSlotsIdPut(updateBlockedSlotRequest)

Update an existing blocked room/time slot.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    UpdateBlockedSlotRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let id: number; // (default to undefined)
let updateBlockedSlotRequest: UpdateBlockedSlotRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingBlockedSlotsIdPut(
    id,
    updateBlockedSlotRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateBlockedSlotRequest** | **UpdateBlockedSlotRequest**|  | |
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
|**404** | Not Found |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminSchedulingBlockedSlotsLocationPost**
> BlockLocationSlotResponse apiAdminSchedulingBlockedSlotsLocationPost(blockLocationSlotRequest)

Block a time interval (e.g. lunch break) across all rooms at a saloon location.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    BlockLocationSlotRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let blockLocationSlotRequest: BlockLocationSlotRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingBlockedSlotsLocationPost(
    blockLocationSlotRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **blockLocationSlotRequest** | **BlockLocationSlotRequest**|  | |


### Return type

**BlockLocationSlotResponse**

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

# **apiAdminSchedulingBlockedSlotsPost**
> IdResponse apiAdminSchedulingBlockedSlotsPost(blockSlotRequest)

Block a room/time slot for a reason (lunch break, therapist leave, etc). Fails if the slot already has a booking.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    BlockSlotRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let blockSlotRequest: BlockSlotRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingBlockedSlotsPost(
    blockSlotRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **blockSlotRequest** | **BlockSlotRequest**|  | |


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
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |
|**204** | No Content |  -  |

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
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let locationId: number; // (optional) (default to undefined)
let date: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminSchedulingRosterGet(
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
|**403** | Forbidden |  -  |
|**400** | Bad Request |  -  |
|**204** | No Content |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminSchedulingTherapistShiftsIdPut**
> apiAdminSchedulingTherapistShiftsIdPut(updateTherapistShiftRequest)

Update a therapist\'s shift start and end times.

### Example

```typescript
import {
    SchedulingApi,
    Configuration,
    UpdateTherapistShiftRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new SchedulingApi(configuration);

let id: number; // (default to undefined)
let updateTherapistShiftRequest: UpdateTherapistShiftRequest; //

const { status, data } = await apiInstance.apiAdminSchedulingTherapistShiftsIdPut(
    id,
    updateTherapistShiftRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateTherapistShiftRequest** | **UpdateTherapistShiftRequest**|  | |
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

