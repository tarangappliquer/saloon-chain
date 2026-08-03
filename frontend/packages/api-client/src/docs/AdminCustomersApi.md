# AdminCustomersApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminCustomersSearchGet**](#apiadmincustomerssearchget) | **GET** /api/admin/customers/search | |

# **apiAdminCustomersSearchGet**
> Array<CustomerSummaryDto> apiAdminCustomersSearchGet()

Search customers by name/email for the emulation picker.

### Example

```typescript
import {
    AdminCustomersApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new AdminCustomersApi(configuration);

let q: string; // (default to undefined)

const { status, data } = await apiInstance.apiAdminCustomersSearchGet(
    q
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **q** | [**string**] |  | defaults to undefined|


### Return type

**Array<CustomerSummaryDto>**

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

