# HttpValidationProblemDetails


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**type** | **string** |  | [optional] [default to undefined]
**title** | **string** |  | [optional] [default to undefined]
**status** | [**CreateStaffRequestChainId**](CreateStaffRequestChainId.md) |  | [optional] [default to undefined]
**detail** | **string** |  | [optional] [default to undefined]
**instance** | **string** |  | [optional] [default to undefined]
**errors** | **{ [key: string]: Array&lt;string&gt;; }** |  | [optional] [default to undefined]

## Example

```typescript
import { HttpValidationProblemDetails } from './api';

const instance: HttpValidationProblemDetails = {
    type,
    title,
    status,
    detail,
    instance,
    errors,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
