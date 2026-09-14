# AdminDashboardApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminDashboardGet**](#apiadmindashboardget) | **GET** /api/admin/dashboard | |

# **apiAdminDashboardGet**
> DashboardResponseDto apiAdminDashboardGet()

Get real-time dashboard KPIs and upcoming appointments scoped by user role and chain/location.

### Example

```typescript
import {
    AdminDashboardApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminDashboardApi(configuration);

let startDate: string; // (optional) (default to undefined)
let endDate: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminDashboardGet(
    startDate,
    endDate
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **startDate** | [**string**] |  | (optional) defaults to undefined|
| **endDate** | [**string**] |  | (optional) defaults to undefined|


### Return type

**DashboardResponseDto**

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

