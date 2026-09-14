# AdminCatalogApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminCatalogChainsGet**](#apiadmincatalogchainsget) | **GET** /api/admin/catalog/chains | |
|[**apiAdminCatalogChainsIdDelete**](#apiadmincatalogchainsiddelete) | **DELETE** /api/admin/catalog/chains/{id} | |
|[**apiAdminCatalogChainsIdPut**](#apiadmincatalogchainsidput) | **PUT** /api/admin/catalog/chains/{id} | |
|[**apiAdminCatalogChainsPost**](#apiadmincatalogchainspost) | **POST** /api/admin/catalog/chains | |
|[**apiAdminCatalogClosuresGet**](#apiadmincatalogclosuresget) | **GET** /api/admin/catalog/closures | |
|[**apiAdminCatalogClosuresIdDelete**](#apiadmincatalogclosuresiddelete) | **DELETE** /api/admin/catalog/closures/{id} | |
|[**apiAdminCatalogClosuresPost**](#apiadmincatalogclosurespost) | **POST** /api/admin/catalog/closures | |
|[**apiAdminCatalogLocationsGet**](#apiadmincataloglocationsget) | **GET** /api/admin/catalog/locations | |
|[**apiAdminCatalogLocationsIdDayScheduleGet**](#apiadmincataloglocationsiddayscheduleget) | **GET** /api/admin/catalog/locations/{id}/day-schedule | |
|[**apiAdminCatalogLocationsIdDaySchedulePost**](#apiadmincataloglocationsiddayschedulepost) | **POST** /api/admin/catalog/locations/{id}/day-schedule | |
|[**apiAdminCatalogLocationsIdDayScheduleScheduleIdDelete**](#apiadmincataloglocationsiddayschedulescheduleiddelete) | **DELETE** /api/admin/catalog/locations/{id}/day-schedule/{scheduleId} | |
|[**apiAdminCatalogLocationsIdDayScheduleScheduleIdPut**](#apiadmincataloglocationsiddayschedulescheduleidput) | **PUT** /api/admin/catalog/locations/{id}/day-schedule/{scheduleId} | |
|[**apiAdminCatalogLocationsIdDelete**](#apiadmincataloglocationsiddelete) | **DELETE** /api/admin/catalog/locations/{id} | |
|[**apiAdminCatalogLocationsIdPut**](#apiadmincataloglocationsidput) | **PUT** /api/admin/catalog/locations/{id} | |
|[**apiAdminCatalogLocationsMineGet**](#apiadmincataloglocationsmineget) | **GET** /api/admin/catalog/locations/mine | |
|[**apiAdminCatalogLocationsPost**](#apiadmincataloglocationspost) | **POST** /api/admin/catalog/locations | |
|[**apiAdminCatalogRoomsGet**](#apiadmincatalogroomsget) | **GET** /api/admin/catalog/rooms | |
|[**apiAdminCatalogRoomsIdPut**](#apiadmincatalogroomsidput) | **PUT** /api/admin/catalog/rooms/{id} | |
|[**apiAdminCatalogRoomsPost**](#apiadmincatalogroomspost) | **POST** /api/admin/catalog/rooms | |
|[**apiAdminCatalogTherapistsGet**](#apiadmincatalogtherapistsget) | **GET** /api/admin/catalog/therapists | |
|[**apiAdminCatalogTherapistsIdPut**](#apiadmincatalogtherapistsidput) | **PUT** /api/admin/catalog/therapists/{id} | |
|[**apiAdminCatalogTherapistsPost**](#apiadmincatalogtherapistspost) | **POST** /api/admin/catalog/therapists | |
|[**apiAdminCatalogTreatmentCategoriesGet**](#apiadmincatalogtreatmentcategoriesget) | **GET** /api/admin/catalog/treatment-categories | |
|[**apiAdminCatalogTreatmentCategoriesIdPut**](#apiadmincatalogtreatmentcategoriesidput) | **PUT** /api/admin/catalog/treatment-categories/{id} | |
|[**apiAdminCatalogTreatmentCategoriesPost**](#apiadmincatalogtreatmentcategoriespost) | **POST** /api/admin/catalog/treatment-categories | |
|[**apiAdminCatalogTreatmentsGet**](#apiadmincatalogtreatmentsget) | **GET** /api/admin/catalog/treatments | |
|[**apiAdminCatalogTreatmentsIdDurationsDurationIdDelete**](#apiadmincatalogtreatmentsiddurationsdurationiddelete) | **DELETE** /api/admin/catalog/treatments/{id}/durations/{durationId} | |
|[**apiAdminCatalogTreatmentsIdDurationsDurationIdPut**](#apiadmincatalogtreatmentsiddurationsdurationidput) | **PUT** /api/admin/catalog/treatments/{id}/durations/{durationId} | |
|[**apiAdminCatalogTreatmentsIdDurationsGet**](#apiadmincatalogtreatmentsiddurationsget) | **GET** /api/admin/catalog/treatments/{id}/durations | |
|[**apiAdminCatalogTreatmentsIdDurationsPost**](#apiadmincatalogtreatmentsiddurationspost) | **POST** /api/admin/catalog/treatments/{id}/durations | |
|[**apiAdminCatalogTreatmentsIdPricesGet**](#apiadmincatalogtreatmentsidpricesget) | **GET** /api/admin/catalog/treatments/{id}/prices | |
|[**apiAdminCatalogTreatmentsIdPricesPost**](#apiadmincatalogtreatmentsidpricespost) | **POST** /api/admin/catalog/treatments/{id}/prices | |
|[**apiAdminCatalogTreatmentsIdPricesPriceIdPut**](#apiadmincatalogtreatmentsidpricespriceidput) | **PUT** /api/admin/catalog/treatments/{id}/prices/{priceId} | |
|[**apiAdminCatalogTreatmentsIdPut**](#apiadmincatalogtreatmentsidput) | **PUT** /api/admin/catalog/treatments/{id} | |
|[**apiAdminCatalogTreatmentsPost**](#apiadmincatalogtreatmentspost) | **POST** /api/admin/catalog/treatments | |

# **apiAdminCatalogChainsGet**
> Array<AdminChainDto> apiAdminCatalogChainsGet()

List chains visible to the caller (all for RootSuperAdmin/Manager/Receptionist, own chain only for SuperAdmin/Admin).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

const { status, data } = await apiInstance.apiAdminCatalogChainsGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<AdminChainDto>**

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

# **apiAdminCatalogChainsIdDelete**
> apiAdminCatalogChainsIdDelete()

Soft-delete a chain (RootSuperAdmin only).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogChainsIdDelete(
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

# **apiAdminCatalogChainsIdPut**
> apiAdminCatalogChainsIdPut(chainUpdateRequest)

Rename or activate/deactivate a chain (RootSuperAdmin any chain, SuperAdmin/Admin their own).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    ChainUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let chainUpdateRequest: ChainUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogChainsIdPut(
    id,
    chainUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainUpdateRequest** | **ChainUpdateRequest**|  | |
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

# **apiAdminCatalogChainsPost**
> IdResponse apiAdminCatalogChainsPost(chainRequest)

Create a new saloon chain (RootSuperAdmin only).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    ChainRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let chainRequest: ChainRequest; //

const { status, data } = await apiInstance.apiAdminCatalogChainsPost(
    chainRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainRequest** | **ChainRequest**|  | |


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

# **apiAdminCatalogClosuresGet**
> Array<LocationClosureDto> apiAdminCatalogClosuresGet()

List closures (holidays/maintenance) for one location or every location in a chain.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationId: number; // (optional) (default to undefined)
let chainId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogClosuresGet(
    locationId,
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|
| **chainId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<LocationClosureDto>**

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

# **apiAdminCatalogClosuresIdDelete**
> apiAdminCatalogClosuresIdDelete()

Remove a closure, re-opening that date.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogClosuresIdDelete(
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
|**404** | Not Found |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogClosuresPost**
> apiAdminCatalogClosuresPost(locationClosureRequest)

Close a location (or a whole chain) for a date range; rejected with 409 if a booking already exists on any date in range.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    LocationClosureRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationClosureRequest: LocationClosureRequest; //

const { status, data } = await apiInstance.apiAdminCatalogClosuresPost(
    locationClosureRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationClosureRequest** | **LocationClosureRequest**|  | |


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
|**409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogLocationsGet**
> Array<AdminLocationDto> apiAdminCatalogLocationsGet()

List a chain\'s locations, including inactive ones (Manager sees only their own).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let chainId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogLocationsGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<AdminLocationDto>**

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

# **apiAdminCatalogLocationsIdDayScheduleGet**
> Array<LocationDayScheduleDto> apiAdminCatalogLocationsIdDayScheduleGet()

List a location\'s effective-dated per-day hours history (current + upcoming).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogLocationsIdDayScheduleGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<LocationDayScheduleDto>**

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

# **apiAdminCatalogLocationsIdDaySchedulePost**
> IdResponse apiAdminCatalogLocationsIdDaySchedulePost(locationDayScheduleRequest)

Schedule a day\'s hours effective from a given date; rejected with 409 if that day/date is already scheduled.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    LocationDayScheduleRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let locationDayScheduleRequest: LocationDayScheduleRequest; //

const { status, data } = await apiInstance.apiAdminCatalogLocationsIdDaySchedulePost(
    id,
    locationDayScheduleRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationDayScheduleRequest** | **LocationDayScheduleRequest**|  | |
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

# **apiAdminCatalogLocationsIdDayScheduleScheduleIdDelete**
> apiAdminCatalogLocationsIdDayScheduleScheduleIdDelete()

Cancel a not-yet-effective scheduled hours change; rejected with 409 if it\'s already in effect.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let scheduleId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogLocationsIdDayScheduleScheduleIdDelete(
    id,
    scheduleId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **scheduleId** | [**number**] |  | defaults to undefined|


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

# **apiAdminCatalogLocationsIdDayScheduleScheduleIdPut**
> apiAdminCatalogLocationsIdDayScheduleScheduleIdPut(locationDayScheduleRequest)

Correct a not-yet-effective scheduled hours change in place; rejected with 409 if it\'s already in effect or the new date collides.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    LocationDayScheduleRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let scheduleId: number; // (default to undefined)
let locationDayScheduleRequest: LocationDayScheduleRequest; //

const { status, data } = await apiInstance.apiAdminCatalogLocationsIdDayScheduleScheduleIdPut(
    id,
    scheduleId,
    locationDayScheduleRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationDayScheduleRequest** | **LocationDayScheduleRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|
| **scheduleId** | [**number**] |  | defaults to undefined|


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
|**409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogLocationsIdDelete**
> apiAdminCatalogLocationsIdDelete()

Soft-delete a location.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogLocationsIdDelete(
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

# **apiAdminCatalogLocationsIdPut**
> apiAdminCatalogLocationsIdPut(locationUpdateRequest)

Update a location\'s details or active state (Manager limited to their own location).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    LocationUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let locationUpdateRequest: LocationUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogLocationsIdPut(
    id,
    locationUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationUpdateRequest** | **LocationUpdateRequest**|  | |
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

# **apiAdminCatalogLocationsMineGet**
> AdminLocationDto apiAdminCatalogLocationsMineGet()

Get the caller\'s own location (Manager/Receptionist/Therapist/Other).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

const { status, data } = await apiInstance.apiAdminCatalogLocationsMineGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**AdminLocationDto**

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

# **apiAdminCatalogLocationsPost**
> IdResponse apiAdminCatalogLocationsPost(locationRequest)

Create a new location under a chain.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    LocationRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationRequest: LocationRequest; //

const { status, data } = await apiInstance.apiAdminCatalogLocationsPost(
    locationRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationRequest** | **LocationRequest**|  | |


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

# **apiAdminCatalogRoomsGet**
> Array<RoomDto> apiAdminCatalogRoomsGet()

List a location\'s rooms.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogRoomsGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<RoomDto>**

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

# **apiAdminCatalogRoomsIdPut**
> apiAdminCatalogRoomsIdPut(roomUpdateRequest)

Update a room\'s name or active state.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    RoomUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let roomUpdateRequest: RoomUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogRoomsIdPut(
    id,
    roomUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **roomUpdateRequest** | **RoomUpdateRequest**|  | |
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

# **apiAdminCatalogRoomsPost**
> IdResponse apiAdminCatalogRoomsPost(roomRequest)

Create a new room under a location.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    RoomRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let roomRequest: RoomRequest; //

const { status, data } = await apiInstance.apiAdminCatalogRoomsPost(
    roomRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **roomRequest** | **RoomRequest**|  | |


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

# **apiAdminCatalogTherapistsGet**
> Array<TherapistDto> apiAdminCatalogTherapistsGet()

List therapists visible to the caller (all for RootSuperAdmin, own chain for SuperAdmin/Admin, own location for Manager).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

const { status, data } = await apiInstance.apiAdminCatalogTherapistsGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<TherapistDto>**

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

# **apiAdminCatalogTherapistsIdPut**
> apiAdminCatalogTherapistsIdPut(therapistUpdateRequest)

Update a therapist\'s name or active state.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TherapistUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let therapistUpdateRequest: TherapistUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTherapistsIdPut(
    id,
    therapistUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **therapistUpdateRequest** | **TherapistUpdateRequest**|  | |
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

# **apiAdminCatalogTherapistsPost**
> IdResponse apiAdminCatalogTherapistsPost(therapistRequest)

Create a new therapist.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TherapistRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let therapistRequest: TherapistRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTherapistsPost(
    therapistRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **therapistRequest** | **TherapistRequest**|  | |


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

# **apiAdminCatalogTreatmentCategoriesGet**
> Array<TreatmentCategoryDto> apiAdminCatalogTreatmentCategoriesGet()

List a location\'s treatment categories.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentCategoriesGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<TreatmentCategoryDto>**

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

# **apiAdminCatalogTreatmentCategoriesIdPut**
> apiAdminCatalogTreatmentCategoriesIdPut(treatmentCategoryUpdateRequest)

Rename a treatment category or change its active state.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentCategoryUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let treatmentCategoryUpdateRequest: TreatmentCategoryUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentCategoriesIdPut(
    id,
    treatmentCategoryUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentCategoryUpdateRequest** | **TreatmentCategoryUpdateRequest**|  | |
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

# **apiAdminCatalogTreatmentCategoriesPost**
> IdResponse apiAdminCatalogTreatmentCategoriesPost(treatmentCategoryRequest)

Create a new treatment category under a location.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentCategoryRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let treatmentCategoryRequest: TreatmentCategoryRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentCategoriesPost(
    treatmentCategoryRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentCategoryRequest** | **TreatmentCategoryRequest**|  | |


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

# **apiAdminCatalogTreatmentsGet**
> Array<AdminTreatmentDto> apiAdminCatalogTreatmentsGet()

List a location\'s treatments, including inactive ones.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<AdminTreatmentDto>**

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

# **apiAdminCatalogTreatmentsIdDurationsDurationIdDelete**
> apiAdminCatalogTreatmentsIdDurationsDurationIdDelete()

Delete a scheduled duration, if no booking has used it yet.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let durationId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdDurationsDurationIdDelete(
    id,
    durationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|
| **durationId** | [**number**] |  | defaults to undefined|


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

# **apiAdminCatalogTreatmentsIdDurationsDurationIdPut**
> apiAdminCatalogTreatmentsIdDurationsDurationIdPut(treatmentDurationUpdateRequest)

Correct a scheduled duration\'s slot count, if no booking has used it yet.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentDurationUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let durationId: number; // (default to undefined)
let treatmentDurationUpdateRequest: TreatmentDurationUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdDurationsDurationIdPut(
    id,
    durationId,
    treatmentDurationUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentDurationUpdateRequest** | **TreatmentDurationUpdateRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|
| **durationId** | [**number**] |  | defaults to undefined|


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

# **apiAdminCatalogTreatmentsIdDurationsGet**
> Array<TreatmentDurationDto> apiAdminCatalogTreatmentsIdDurationsGet()

List a treatment\'s duration history, newest effective date first.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdDurationsGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<TreatmentDurationDto>**

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

# **apiAdminCatalogTreatmentsIdDurationsPost**
> IdResponse apiAdminCatalogTreatmentsIdDurationsPost(treatmentDurationRequest)

Schedule a new effective-dated duration for a treatment, rejecting dates that already have a booking on or after them.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentDurationRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let treatmentDurationRequest: TreatmentDurationRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdDurationsPost(
    id,
    treatmentDurationRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentDurationRequest** | **TreatmentDurationRequest**|  | |
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

# **apiAdminCatalogTreatmentsIdPricesGet**
> Array<TreatmentPriceDto> apiAdminCatalogTreatmentsIdPricesGet()

List a treatment\'s price history, newest effective date first.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdPricesGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**Array<TreatmentPriceDto>**

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

# **apiAdminCatalogTreatmentsIdPricesPost**
> IdResponse apiAdminCatalogTreatmentsIdPricesPost(treatmentPriceRequest)

Schedule a new effective-dated price for a treatment.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentPriceRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let treatmentPriceRequest: TreatmentPriceRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdPricesPost(
    id,
    treatmentPriceRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentPriceRequest** | **TreatmentPriceRequest**|  | |
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

# **apiAdminCatalogTreatmentsIdPricesPriceIdPut**
> apiAdminCatalogTreatmentsIdPricesPriceIdPut(treatmentPriceUpdateRequest)

Correct a scheduled price\'s amount, if no booking has used it yet.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentPriceUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let priceId: number; // (default to undefined)
let treatmentPriceUpdateRequest: TreatmentPriceUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdPricesPriceIdPut(
    id,
    priceId,
    treatmentPriceUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentPriceUpdateRequest** | **TreatmentPriceUpdateRequest**|  | |
| **id** | [**number**] |  | defaults to undefined|
| **priceId** | [**number**] |  | defaults to undefined|


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

# **apiAdminCatalogTreatmentsIdPut**
> apiAdminCatalogTreatmentsIdPut(treatmentUpdateRequest)

Update a treatment\'s details, go-live date, or active state (price and duration are managed separately -- see /treatments/{id}/prices and /treatments/{id}/durations).

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let treatmentUpdateRequest: TreatmentUpdateRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdPut(
    id,
    treatmentUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentUpdateRequest** | **TreatmentUpdateRequest**|  | |
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

# **apiAdminCatalogTreatmentsPost**
> IdResponse apiAdminCatalogTreatmentsPost(treatmentRequest)

Create a new treatment under a location/category, seeding its required first price (effective today) -- see /treatments/{id}/prices to schedule later changes.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    TreatmentRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let treatmentRequest: TreatmentRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsPost(
    treatmentRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **treatmentRequest** | **TreatmentRequest**|  | |


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

