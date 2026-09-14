# AdminCancelReasonsApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminCancelReasonsGet**](#apiadmincancelreasonsget) | **GET** /api/admin/cancel-reasons | |

# **apiAdminCancelReasonsGet**
> Array<CancelReasonDto> apiAdminCancelReasonsGet()

List the fixed cancellation-reason master list.

### Example

```typescript
import {
    AdminCancelReasonsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCancelReasonsApi(configuration);

const { status, data } = await apiInstance.apiAdminCancelReasonsGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<CancelReasonDto>**

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

