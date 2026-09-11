# CreateBlockTypeRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**name** | **string** |  | [default to undefined]
**chainId** | **number** |  | [optional] [default to undefined]
**locationId** | **number** |  | [optional] [default to undefined]
**isPaid** | **boolean** |  | [optional] [default to false]
**defaultDurationMinutes** | **number** |  | [optional] [default to 30]
**colorHex** | **string** |  | [optional] [default to '#F59E0B']

## Example

```typescript
import { CreateBlockTypeRequest } from './api';

const instance: CreateBlockTypeRequest = {
    name,
    chainId,
    locationId,
    isPaid,
    defaultDurationMinutes,
    colorHex,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
