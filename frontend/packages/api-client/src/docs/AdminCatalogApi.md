# AdminCatalogApi

All URIs are relative to *https://localhost:7185*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminCatalogChainsGet**](#apiadmincatalogchainsget) | **GET** /api/admin/catalog/chains | |
|[**apiAdminCatalogChainsIdDelete**](#apiadmincatalogchainsiddelete) | **DELETE** /api/admin/catalog/chains/{id} | |
|[**apiAdminCatalogChainsIdPut**](#apiadmincatalogchainsidput) | **PUT** /api/admin/catalog/chains/{id} | |
|[**apiAdminCatalogChainsPost**](#apiadmincatalogchainspost) | **POST** /api/admin/catalog/chains | |
|[**apiAdminCatalogLocationsGet**](#apiadmincataloglocationsget) | **GET** /api/admin/catalog/locations | |
|[**apiAdminCatalogLocationsIdDelete**](#apiadmincataloglocationsiddelete) | **DELETE** /api/admin/catalog/locations/{id} | |
|[**apiAdminCatalogLocationsIdPut**](#apiadmincataloglocationsidput) | **PUT** /api/admin/catalog/locations/{id} | |
|[**apiAdminCatalogLocationsLocationIdTreatmentsTreatmentIdDelete**](#apiadmincataloglocationslocationidtreatmentstreatmentiddelete) | **DELETE** /api/admin/catalog/locations/{locationId}/treatments/{treatmentId} | |
|[**apiAdminCatalogLocationsPost**](#apiadmincataloglocationspost) | **POST** /api/admin/catalog/locations | |
|[**apiAdminCatalogRoomsGet**](#apiadmincatalogroomsget) | **GET** /api/admin/catalog/rooms | |
|[**apiAdminCatalogRoomsIdPut**](#apiadmincatalogroomsidput) | **PUT** /api/admin/catalog/rooms/{id} | |
|[**apiAdminCatalogRoomsPost**](#apiadmincatalogroomspost) | **POST** /api/admin/catalog/rooms | |
|[**apiAdminCatalogTherapistsGet**](#apiadmincatalogtherapistsget) | **GET** /api/admin/catalog/therapists | |
|[**apiAdminCatalogTherapistsIdPut**](#apiadmincatalogtherapistsidput) | **PUT** /api/admin/catalog/therapists/{id} | |
|[**apiAdminCatalogTherapistsPost**](#apiadmincatalogtherapistspost) | **POST** /api/admin/catalog/therapists | |
|[**apiAdminCatalogTreatmentCategoriesGet**](#apiadmincatalogtreatmentcategoriesget) | **GET** /api/admin/catalog/treatment-categories | |
|[**apiAdminCatalogTreatmentCategoriesPost**](#apiadmincatalogtreatmentcategoriespost) | **POST** /api/admin/catalog/treatment-categories | |
|[**apiAdminCatalogTreatmentsGet**](#apiadmincatalogtreatmentsget) | **GET** /api/admin/catalog/treatments | |
|[**apiAdminCatalogTreatmentsIdAssignPost**](#apiadmincatalogtreatmentsidassignpost) | **POST** /api/admin/catalog/treatments/{id}/assign | |
|[**apiAdminCatalogTreatmentsIdPut**](#apiadmincatalogtreatmentsidput) | **PUT** /api/admin/catalog/treatments/{id} | |
|[**apiAdminCatalogTreatmentsPost**](#apiadmincatalogtreatmentspost) | **POST** /api/admin/catalog/treatments | |

# **apiAdminCatalogChainsGet**
> Array<AdminChainDto> apiAdminCatalogChainsGet()

List chains visible to the caller (all for SuperAdmin/Manager, own chain only for Admin).

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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogChainsIdDelete**
> apiAdminCatalogChainsIdDelete()

Soft-delete a chain (SuperAdmin only).

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogChainsIdPut**
> apiAdminCatalogChainsIdPut(chainUpdateRequest)

Rename or activate/deactivate a chain (SuperAdmin only).

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogChainsPost**
> IdResponse apiAdminCatalogChainsPost(chainRequest)

Create a new saloon chain (SuperAdmin only).

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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogLocationsGet**
> Array<AdminLocationDto> apiAdminCatalogLocationsGet()

List a chain\'s locations, including inactive ones.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let chainId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogLocationsGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|


### Return type

**Array<AdminLocationDto>**

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogLocationsIdPut**
> apiAdminCatalogLocationsIdPut(locationUpdateRequest)

Update a location\'s details or active state.

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogLocationsLocationIdTreatmentsTreatmentIdDelete**
> apiAdminCatalogLocationsLocationIdTreatmentsTreatmentIdDelete()

Remove a treatment from a location.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationId: number; // (default to undefined)
let treatmentId: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogLocationsLocationIdTreatmentsTreatmentIdDelete(
    locationId,
    treatmentId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | defaults to undefined|
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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogRoomsGet**
> Array<RoomDto> apiAdminCatalogRoomsGet()

List a location\'s rooms.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogRoomsGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|


### Return type

**Array<RoomDto>**

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogTherapistsGet**
> Array<TherapistDto> apiAdminCatalogTherapistsGet()

List every therapist.

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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogTreatmentCategoriesGet**
> Array<TreatmentCategoryDto> apiAdminCatalogTreatmentCategoriesGet()

List a chain\'s treatment categories.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let chainId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentCategoriesGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|


### Return type

**Array<TreatmentCategoryDto>**

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

# **apiAdminCatalogTreatmentCategoriesPost**
> IdResponse apiAdminCatalogTreatmentCategoriesPost(treatmentCategoryRequest)

Create a new treatment category under a chain.

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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogTreatmentsGet**
> Array<AdminTreatmentDto> apiAdminCatalogTreatmentsGet()

List a chain\'s treatments, including inactive ones.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let chainId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|


### Return type

**Array<AdminTreatmentDto>**

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

# **apiAdminCatalogTreatmentsIdAssignPost**
> apiAdminCatalogTreatmentsIdAssignPost(assignTreatmentRequest)

Assign a treatment to a location, optionally overriding its price there.

### Example

```typescript
import {
    AdminCatalogApi,
    Configuration,
    AssignTreatmentRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCatalogApi(configuration);

let id: number; // (default to undefined)
let assignTreatmentRequest: AssignTreatmentRequest; //

const { status, data } = await apiInstance.apiAdminCatalogTreatmentsIdAssignPost(
    id,
    assignTreatmentRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **assignTreatmentRequest** | **AssignTreatmentRequest**|  | |
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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogTreatmentsIdPut**
> apiAdminCatalogTreatmentsIdPut(treatmentUpdateRequest)

Update a treatment\'s details or active state.

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
|**204** | No Content |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminCatalogTreatmentsPost**
> IdResponse apiAdminCatalogTreatmentsPost(treatmentRequest)

Create a new treatment under a chain/category.

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
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |
|**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

