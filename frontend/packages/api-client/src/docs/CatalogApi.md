# CatalogApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiCatalogChainsGet**](#apicatalogchainsget) | **GET** /api/catalog/chains | |
|[**apiCatalogLocationsGet**](#apicataloglocationsget) | **GET** /api/catalog/locations | |
|[**apiCatalogSearchGet**](#apicatalogsearchget) | **GET** /api/catalog/search | |
|[**apiCatalogTreatmentsGet**](#apicatalogtreatmentsget) | **GET** /api/catalog/treatments | |
|[**apiCatalogTreatmentsIdDurationsGet**](#apicatalogtreatmentsiddurationsget) | **GET** /api/catalog/treatments/{id}/durations | |
|[**apiCatalogTreatmentsIdPricesGet**](#apicatalogtreatmentsidpricesget) | **GET** /api/catalog/treatments/{id}/prices | |

# **apiCatalogChainsGet**
> Array<ChainDto> apiCatalogChainsGet()

List active saloon chains (filtered to the staff member\'s chain during emulation).

### Example

```typescript
import {
    CatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

const { status, data } = await apiInstance.apiCatalogChainsGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<ChainDto>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiCatalogLocationsGet**
> Array<LocationDto> apiCatalogLocationsGet()

List active locations for a chain (filtered during emulation).

### Example

```typescript
import {
    CatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let chainId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiCatalogLocationsGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<LocationDto>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiCatalogSearchGet**
> Array<VenueSearchResultDto> apiCatalogSearchGet()

Search saloons, locations, treatments, and categories.

### Example

```typescript
import {
    CatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let q: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiCatalogSearchGet(
    q
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **q** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<VenueSearchResultDto>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiCatalogTreatmentsGet**
> Array<TreatmentDto> apiCatalogTreatmentsGet()

List the treatments a location offers, optionally filtered by category.

### Example

```typescript
import {
    CatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let locationId: number; // (optional) (default to undefined)
let categoryId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiCatalogTreatmentsGet(
    locationId,
    categoryId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|
| **categoryId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<TreatmentDto>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiCatalogTreatmentsIdDurationsGet**
> Array<TreatmentDurationDto> apiCatalogTreatmentsIdDurationsGet()

List a treatment\'s full duration history (past and scheduled future), newest effective date first.

### Example

```typescript
import {
    CatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiCatalogTreatmentsIdDurationsGet(
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

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiCatalogTreatmentsIdPricesGet**
> Array<TreatmentPriceDto> apiCatalogTreatmentsIdPricesGet()

List a treatment\'s full price history (past and scheduled future), newest effective date first.

### Example

```typescript
import {
    CatalogApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiCatalogTreatmentsIdPricesGet(
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

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

