# ReviewApi

All URIs are relative to *http://localhost:5199*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**apiReviewsPost**](#apireviewspost) | **POST** /api/reviews | |

# **apiReviewsPost**
> IdResponse apiReviewsPost(createReviewRequest)

Leave a review for a completed booking (Confirmed, every treatment\'s EndTime passed, not already reviewed).

### Example

```typescript
import {
    ReviewApi,
    Configuration,
    CreateReviewRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new ReviewApi(configuration);

let createReviewRequest: CreateReviewRequest; //

const { status, data } = await apiInstance.apiReviewsPost(
    createReviewRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createReviewRequest** | **CreateReviewRequest**|  | |


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
|**409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

