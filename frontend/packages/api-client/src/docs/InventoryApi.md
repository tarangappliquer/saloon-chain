# InventoryApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiAdminInventoryProductsGet**](#apiadmininventoryproductsget) | **GET** /api/admin/inventory/products | |
|[**apiAdminInventoryProductsIdDelete**](#apiadmininventoryproductsiddelete) | **DELETE** /api/admin/inventory/products/{id} | |
|[**apiAdminInventoryProductsIdPut**](#apiadmininventoryproductsidput) | **PUT** /api/admin/inventory/products/{id} | |
|[**apiAdminInventoryProductsLowStockGet**](#apiadmininventoryproductslowstockget) | **GET** /api/admin/inventory/products/low-stock | |
|[**apiAdminInventoryProductsPost**](#apiadmininventoryproductspost) | **POST** /api/admin/inventory/products | |
|[**apiAdminInventoryPurchaseOrdersGet**](#apiadmininventorypurchaseordersget) | **GET** /api/admin/inventory/purchase-orders | |
|[**apiAdminInventoryPurchaseOrdersIdGet**](#apiadmininventorypurchaseordersidget) | **GET** /api/admin/inventory/purchase-orders/{id} | |
|[**apiAdminInventoryPurchaseOrdersIdReceivePost**](#apiadmininventorypurchaseordersidreceivepost) | **POST** /api/admin/inventory/purchase-orders/{id}/receive | |
|[**apiAdminInventoryPurchaseOrdersPost**](#apiadmininventorypurchaseorderspost) | **POST** /api/admin/inventory/purchase-orders | |
|[**apiAdminInventorySuppliersGet**](#apiadmininventorysuppliersget) | **GET** /api/admin/inventory/suppliers | |
|[**apiAdminInventorySuppliersIdDelete**](#apiadmininventorysuppliersiddelete) | **DELETE** /api/admin/inventory/suppliers/{id} | |
|[**apiAdminInventorySuppliersIdPut**](#apiadmininventorysuppliersidput) | **PUT** /api/admin/inventory/suppliers/{id} | |
|[**apiAdminInventorySuppliersPost**](#apiadmininventorysupplierspost) | **POST** /api/admin/inventory/suppliers | |

# **apiAdminInventoryProductsGet**
> Array<ProductDto> apiAdminInventoryProductsGet()

List a location\'s retail products, including inactive ones.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminInventoryProductsGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<ProductDto>**

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

# **apiAdminInventoryProductsIdDelete**
> apiAdminInventoryProductsIdDelete()

Soft-delete a product.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminInventoryProductsIdDelete(
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

# **apiAdminInventoryProductsIdPut**
> apiAdminInventoryProductsIdPut(productUpdateRequest)

Update a product\'s details, price, or active state (stock only ever moves via purchase orders or bookings).

### Example

```typescript
import {
    InventoryApi,
    Configuration,
    ProductUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let id: number; // (default to undefined)
let productUpdateRequest: ProductUpdateRequest; //

const { status, data } = await apiInstance.apiAdminInventoryProductsIdPut(
    id,
    productUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **productUpdateRequest** | **ProductUpdateRequest**|  | |
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

# **apiAdminInventoryProductsLowStockGet**
> Array<LowStockProductDto> apiAdminInventoryProductsLowStockGet()

List a location\'s products at or below their reorder threshold.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminInventoryProductsLowStockGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<LowStockProductDto>**

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

# **apiAdminInventoryProductsPost**
> IdResponse apiAdminInventoryProductsPost(productRequest)

Create a new retail product under a location, with its starting stock count.

### Example

```typescript
import {
    InventoryApi,
    Configuration,
    ProductRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let productRequest: ProductRequest; //

const { status, data } = await apiInstance.apiAdminInventoryProductsPost(
    productRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **productRequest** | **ProductRequest**|  | |


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

# **apiAdminInventoryPurchaseOrdersGet**
> Array<PurchaseOrderDto> apiAdminInventoryPurchaseOrdersGet()

List a location\'s purchase orders, newest first.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let locationId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminInventoryPurchaseOrdersGet(
    locationId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **locationId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<PurchaseOrderDto>**

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

# **apiAdminInventoryPurchaseOrdersIdGet**
> PurchaseOrderDetailDto apiAdminInventoryPurchaseOrdersIdGet()

Get a purchase order\'s header and lines.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminInventoryPurchaseOrdersIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**number**] |  | defaults to undefined|


### Return type

**PurchaseOrderDetailDto**

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

# **apiAdminInventoryPurchaseOrdersIdReceivePost**
> apiAdminInventoryPurchaseOrdersIdReceivePost()

Mark a purchase order Received and add its lines\' quantities to stock.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminInventoryPurchaseOrdersIdReceivePost(
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

# **apiAdminInventoryPurchaseOrdersPost**
> IdResponse apiAdminInventoryPurchaseOrdersPost(purchaseOrderRequest)

Create a purchase order with one or more product lines.

### Example

```typescript
import {
    InventoryApi,
    Configuration,
    PurchaseOrderRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let purchaseOrderRequest: PurchaseOrderRequest; //

const { status, data } = await apiInstance.apiAdminInventoryPurchaseOrdersPost(
    purchaseOrderRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **purchaseOrderRequest** | **PurchaseOrderRequest**|  | |


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

# **apiAdminInventorySuppliersGet**
> Array<SupplierDto> apiAdminInventorySuppliersGet()

List a chain\'s suppliers.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let chainId: number; // (optional) (default to undefined)

const { status, data } = await apiInstance.apiAdminInventorySuppliersGet(
    chainId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **chainId** | [**number**] |  | (optional) defaults to undefined|


### Return type

**Array<SupplierDto>**

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

# **apiAdminInventorySuppliersIdDelete**
> apiAdminInventorySuppliersIdDelete()

Soft-delete a supplier.

### Example

```typescript
import {
    InventoryApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let id: number; // (default to undefined)

const { status, data } = await apiInstance.apiAdminInventorySuppliersIdDelete(
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

# **apiAdminInventorySuppliersIdPut**
> apiAdminInventorySuppliersIdPut(supplierUpdateRequest)

Update a supplier\'s contact details or active state.

### Example

```typescript
import {
    InventoryApi,
    Configuration,
    SupplierUpdateRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let id: number; // (default to undefined)
let supplierUpdateRequest: SupplierUpdateRequest; //

const { status, data } = await apiInstance.apiAdminInventorySuppliersIdPut(
    id,
    supplierUpdateRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **supplierUpdateRequest** | **SupplierUpdateRequest**|  | |
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

# **apiAdminInventorySuppliersPost**
> IdResponse apiAdminInventorySuppliersPost(supplierRequest)

Create a new supplier under the caller\'s chain.

### Example

```typescript
import {
    InventoryApi,
    Configuration,
    SupplierRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new InventoryApi(configuration);

let supplierRequest: SupplierRequest; //

const { status, data } = await apiInstance.apiAdminInventorySuppliersPost(
    supplierRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **supplierRequest** | **SupplierRequest**|  | |


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

