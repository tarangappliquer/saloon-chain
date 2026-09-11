# ConfigApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiConfigAdminportalGet**](#apiconfigadminportalget) | **GET** /api/config/adminportal | |
|[**apiConfigClientportalGet**](#apiconfigclientportalget) | **GET** /api/config/clientportal | |

# **apiConfigAdminportalGet**
> AdminPortalConfigResponse apiConfigAdminportalGet()

Config the adminportal needs at startup (clientportal base URL).

### Example

```typescript
import {
    ConfigApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ConfigApi(configuration);

const { status, data } = await apiInstance.apiConfigAdminportalGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**AdminPortalConfigResponse**

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

# **apiConfigClientportalGet**
> ClientPortalConfigResponse apiConfigClientportalGet()

Config the clientportal needs at startup (adminportal base URL).

### Example

```typescript
import {
    ConfigApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ConfigApi(configuration);

const { status, data } = await apiInstance.apiConfigClientportalGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**ClientPortalConfigResponse**

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

