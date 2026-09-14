# PaymentApi

All URIs are relative to *http://localhost:5127*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiPaymentsBookingBookingIdGet**](#apipaymentsbookingbookingidget) | **GET** /api/payments/booking/{bookingId} | |
|[**apiPaymentsConfirmManualPost**](#apipaymentsconfirmmanualpost) | **POST** /api/payments/confirm-manual | |
|[**apiPaymentsCreateIntentPost**](#apipaymentscreateintentpost) | **POST** /api/payments/create-intent | |
|[**apiPaymentsStripeWebhookPost**](#apipaymentsstripewebhookpost) | **POST** /api/payments/stripe-webhook | |
|[**apiPaymentsVerifyCheckoutSessionPost**](#apipaymentsverifycheckoutsessionpost) | **POST** /api/payments/verify-checkout-session | |

# **apiPaymentsBookingBookingIdGet**
> Array<PaymentDto> apiPaymentsBookingBookingIdGet()

Get payment details for a booking (staff/back-office view -- customers see payment status via their own booking, not this endpoint).

### Example

```typescript
import {
    PaymentApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentApi(configuration);

let bookingId: number; // (default to undefined)

const { status, data } = await apiInstance.apiPaymentsBookingBookingIdGet(
    bookingId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **bookingId** | [**number**] |  | defaults to undefined|


### Return type

**Array<PaymentDto>**

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

# **apiPaymentsConfirmManualPost**
> PaymentResultDto apiPaymentsConfirmManualPost(confirmManualEndpointRequest)

Confirm or record a manual/offline payment (Cash or POS Terminal).

### Example

```typescript
import {
    PaymentApi,
    Configuration,
    ConfirmManualEndpointRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentApi(configuration);

let confirmManualEndpointRequest: ConfirmManualEndpointRequest; //

const { status, data } = await apiInstance.apiPaymentsConfirmManualPost(
    confirmManualEndpointRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **confirmManualEndpointRequest** | **ConfirmManualEndpointRequest**|  | |


### Return type

**PaymentResultDto**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |
|**403** | Forbidden |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiPaymentsCreateIntentPost**
> CreatePaymentResponse apiPaymentsCreateIntentPost(createIntentEndpointRequest)

Create a payment intent for a booking (Stripe, Cash, or InHouse terminal).

### Example

```typescript
import {
    PaymentApi,
    Configuration,
    CreateIntentEndpointRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentApi(configuration);

let createIntentEndpointRequest: CreateIntentEndpointRequest; //

const { status, data } = await apiInstance.apiPaymentsCreateIntentPost(
    createIntentEndpointRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createIntentEndpointRequest** | **CreateIntentEndpointRequest**|  | |


### Return type

**CreatePaymentResponse**

### Authorization

[Bearer](../README.md#Bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |
|**403** | Forbidden |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiPaymentsStripeWebhookPost**
> apiPaymentsStripeWebhookPost()

Stripe webhook listener.

### Example

```typescript
import {
    PaymentApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentApi(configuration);

const { status, data } = await apiInstance.apiPaymentsStripeWebhookPost();
```

### Parameters
This endpoint does not have any parameters.


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/problem+json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |
|**400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **apiPaymentsVerifyCheckoutSessionPost**
> PaymentResultDto apiPaymentsVerifyCheckoutSessionPost(verifyCheckoutSessionEndpointRequest)

Verify Stripe Checkout Session status and confirm booking if paid.

### Example

```typescript
import {
    PaymentApi,
    Configuration,
    VerifyCheckoutSessionEndpointRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PaymentApi(configuration);

let verifyCheckoutSessionEndpointRequest: VerifyCheckoutSessionEndpointRequest; //

const { status, data } = await apiInstance.apiPaymentsVerifyCheckoutSessionPost(
    verifyCheckoutSessionEndpointRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **verifyCheckoutSessionEndpointRequest** | **VerifyCheckoutSessionEndpointRequest**|  | |


### Return type

**PaymentResultDto**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/problem+json, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**400** | Bad Request |  -  |
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

