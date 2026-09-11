# PayrollApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminPayrollCommissionRulesGet**](#apiadminpayrollcommissionrulesget) | **GET** /api/admin/payroll/commission-rules | |
|[**apiAdminPayrollCommissionRulesIdDelete**](#apiadminpayrollcommissionrulesiddelete) | **DELETE** /api/admin/payroll/commission-rules/{id} | |
|[**apiAdminPayrollCommissionRulesPost**](#apiadminpayrollcommissionrulespost) | **POST** /api/admin/payroll/commission-rules | |
|[**apiAdminPayrollPayRunsGet**](#apiadminpayrollpayrunsget) | **GET** /api/admin/payroll/pay-runs | |
|[**apiAdminPayrollPayRunsIdFinalizePost**](#apiadminpayrollpayrunsidfinalizepost) | **POST** /api/admin/payroll/pay-runs/{id}/finalize | |
|[**apiAdminPayrollPayRunsIdGet**](#apiadminpayrollpayrunsidget) | **GET** /api/admin/payroll/pay-runs/{id} | |
|[**apiAdminPayrollPayRunsPost**](#apiadminpayrollpayrunspost) | **POST** /api/admin/payroll/pay-runs | |

# **apiAdminPayrollCommissionRulesGet**
> Array<CommissionRuleDto> apiAdminPayrollCommissionRulesGet()

List a location\'s commission rules (therapist-specific and the location default).

### Example

```typescript
import {
    PayrollApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminPayrollCommissionRulesGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<CommissionRuleDto>**

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

# **apiAdminPayrollCommissionRulesIdDelete**
> apiAdminPayrollCommissionRulesIdDelete()

Delete a commission rule.

### Example

```typescript
import {
    PayrollApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminPayrollCommissionRulesIdDelete(
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

# **apiAdminPayrollCommissionRulesPost**
> IdResponse apiAdminPayrollCommissionRulesPost(commissionRuleRequest)

Create or replace a commission rule for a therapist, or the location\'s default rule.

### Example

```typescript
import {
    PayrollApi,
    Configuration,
    CommissionRuleRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let commissionRuleRequest: CommissionRuleRequest; //

const { status, data } = await apiInstance.apiAdminPayrollCommissionRulesPost(
    commissionRuleRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **commissionRuleRequest** | **CommissionRuleRequest**|  | |


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

# **apiAdminPayrollPayRunsGet**
> Array<PayRunDto> apiAdminPayrollPayRunsGet()

List a location\'s pay runs, most recent period first.

### Example

```typescript
import {
    PayrollApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminPayrollPayRunsGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<PayRunDto>**

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

# **apiAdminPayrollPayRunsIdFinalizePost**
> apiAdminPayrollPayRunsIdFinalizePost()

Lock a Draft pay run so it\'s no longer regenerable.

### Example

```typescript
import {
    PayrollApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminPayrollPayRunsIdFinalizePost(
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
|**409** | Conflict |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiAdminPayrollPayRunsIdGet**
> PayRunDetailDto apiAdminPayrollPayRunsIdGet()

Get a pay run\'s header and per-therapist commission lines.

### Example

```typescript
import {
    PayrollApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminPayrollPayRunsIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**PayRunDetailDto**

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

# **apiAdminPayrollPayRunsPost**
> IdResponse apiAdminPayrollPayRunsPost(createPayRunRequest)

Generate a pay run: snapshots each therapist\'s gross Confirmed revenue and resolved commission for the period.

### Example

```typescript
import {
    PayrollApi,
    Configuration,
    CreatePayRunRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PayrollApi(configuration);

let createPayRunRequest: CreatePayRunRequest; //

const { status, data } = await apiInstance.apiAdminPayrollPayRunsPost(
    createPayRunRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createPayRunRequest** | **CreatePayRunRequest**|  | |


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

