# CatalogApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiCatalogChainsGet**](#apicatalogchainsget) | **GET** /api/catalog/chains | |
|[**apiCatalogLocationsGet**](#apicataloglocationsget) | **GET** /api/catalog/locations | |
|[**apiCatalogTreatmentsGet**](#apicatalogtreatmentsget) | **GET** /api/catalog/treatments | |

# **apiCatalogChainsGet**
> Array<ChainDto> apiCatalogChainsGet()

List every active saloon chain.

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

List the active locations belonging to a chain.

### Example

```typescript
import {
    CatalogApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let chainId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)

const { status, data } = await apiInstance.apiCatalogLocationsGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|


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

# **apiCatalogTreatmentsGet**
> Array<TreatmentDto> apiCatalogTreatmentsGet()

List the treatments a location offers, optionally filtered by category.

### Example

```typescript
import {
    CatalogApi,
    Configuration,
    ApiBookingStreamGetLocationIdParameter,
    ApiBookingStreamGetLocationIdParameter
} from './api';

const configuration = new Configuration();
const apiInstance = new CatalogApi(configuration);

let locationId: ApiBookingStreamGetLocationIdParameter; // (default to undefined)
let categoryId: ApiBookingStreamGetLocationIdParameter; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiCatalogTreatmentsGet(
    locationId,
    categoryId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**ApiBookingStreamGetLocationIdParameter**] |  | defaults to undefined|
| **categoryId** | [**ApiBookingStreamGetLocationIdParameter**] |  | (optional) defaults to undefined|


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

